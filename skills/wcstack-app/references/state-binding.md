# @wcstack/state Reference

Sources: `packages/state/README.ja.md` (normative), `packages/state/examples/*`, `packages/fetch/examples/users-crud`, `src/filters/builtinFilters.ts`, `src/bindTextParser/*`, plus `docs/csp.md` / `docs/sri.md` / `docs/state-list-key-design.md` / `docs/state-watch-hook-design.md` / `docs/architecture-hardening/15-state-component-mechanism-consistency.md` / `packages/state/docs/scan.md` / `docs/state-scan-design.md`, and the state README's "Keyed selection" and "Preparing for 3.0" sections (v2.6). All verified against real code at v3.0.0; the 2.x ↔ 3.0 comparisons (the parts tagged **v3.0+**, and §16) also against `docs/migration-v3.md`.

## 1. CDN Loading

```html
<!-- Auto-initialization (the one-liner used in all real examples) -->
<script type="module" src="https://esm.run/@wcstack/state/auto"></script>
```

```html
<!-- Manual initialization -->
<script type="module">
  import { bootstrapState } from 'https://esm.run/@wcstack/state';
  bootstrapState();
</script>
```

### Production loading — pin the version and add `integrity` (v1.26+)

```html
<script type="module"
        src="https://cdn.jsdelivr.net/npm/@wcstack/state@3.0.0/dist/auto.min.js"
        integrity="sha384-…"></script>
```

`dist/auto.min.js` is a **self-contained bundle with zero static imports**, so the usual ESM caveat — `integrity` covers the entry but not what it imports — does not apply: one hash covers every line of wcstack that runs. Rules that make it work:

- **Use the version-pinned direct path on `cdn.jsdelivr.net`.** `esm.run` redirects to the `+esm` endpoint, which re-bundles server-side, so a fixed digest can never match there. jsDelivr's plain path does not resolve `package.json` `exports`, so name the real file (`/npm/@wcstack/state/auto` is a 404; `@2.6.1/dist/auto.min.js` is a 200).
- **`crossorigin` is not needed** — `type="module"` is always fetched in CORS mode.
- **Get digests from the GitHub Release** (a table in the body, plus a machine-readable `sri.json` asset), computed from the published tree. Never from jsDelivr's data API: the point of SRI is not trusting the CDN, so letting it self-report is circular.
- **Not covered, by design**: your state definition (inline `<script>` or `src="./state.js"`), route guard scripts, and autoloader-resolved components — all page-supplied code that is dynamically imported at runtime. `dist/index.esm.min.js` is no longer published (v1.26); named imports from `dist/index.esm.js` need import-map `integrity` (Chrome 127 / Safari 18; not Firefox).

### Loading only the features a page uses — split entries (v3.0+)

`/auto` (or `@wcstack/state` + `bootstrapState()`) still ships every feature and **stays the default**: a page that uses everything is smaller as one file than as core plus features, and the one-hash SRI story above holds only for `auto.min.js`. Use the split form only when the user asks for fewer bytes and the page deliberately leaves features out:

```html
<script type="importmap">
{
  "imports": {
    "@wcstack/state/core": "https://cdn.jsdelivr.net/npm/@wcstack/state@3.0.0/dist/split/core.js",
    "@wcstack/state/features/temporal": "https://cdn.jsdelivr.net/npm/@wcstack/state@3.0.0/dist/split/features/temporal.js",
    "@wcstack/state/features/formats": "https://cdn.jsdelivr.net/npm/@wcstack/state@3.0.0/dist/split/features/formats.js"
  }
}
</script>
<script type="module">
  import { bootstrapState, installFeatures } from '@wcstack/state/core';
  import temporal from '@wcstack/state/features/temporal';  // $watch / $scan / $streams
  import formats from '@wcstack/state/features/formats';    // every filter except `not`
  installFeatures([temporal, formats]);
  bootstrapState();
</script>
```

| Entry | Adds |
|---|---|
| `@wcstack/state/core` | `data-wcs`, `for` / `if`, path getters, events, `$command` / `$on`, `$eq*`, the `not` filter, `bootstrapState`, `installFeatures` |
| `…/features/temporal` | `$watch`, `$scan`, `$streams` |
| `…/features/scopes` | `bind-component`, `mount=` volumes, a mounted component's exported getters, DCC (`data-wc-definition`) |
| `…/features/recursion` | `$recursion` and `**` |
| `…/features/ssr` | `enable-ssr` (server rendering and hydration) |
| `…/features/formats` | every built-in filter except `not` (§7) |
| `…/features/devtools` | the DevTools hook source |
| `…/features/diagnostics` | the development-time path warnings: a bound / `$watch` / `$scan` path that does not resolve on the state (`wcs/binding-path-missing`, with did-you-mean). Thrown errors keep their full messages without it |
| `@wcstack/state/define` | `defineState` and the types — no runtime |

- **Never load the split form through `esm.run`.** Its `+esm` endpoint re-bundles each entry and inlines the shared core chunk into every one, so each entry carries its own engine and a feature installs into a copy the core never sees — the page throws `[wcs/feature-not-installed]` although `installFeatures` ran. Use the version-pinned plain jsDelivr path (it does not read `exports`: name the file under `dist/split/`) or a bundler; then every relative import resolves to the same chunk URL and the engine is evaluated once. Integrity needs an import map with `integrity` for every entry and chunk (Chrome 127 / Safari 18; not Firefox) — `docs/sri.md` §5.1.
- A missing feature is loud, not silent: a declaration that needs one throws `[wcs/feature-not-installed] … install it with installFeatures([...]) from "@wcstack/state/features/…"` when the state is defined (`bind-component` on a page without `features/scopes` included), and a filter whose feature is missing throws `[wcs/filter-unknown]` when the bindings are planned. **The one silent omission is `features/diagnostics`**: without it a mistyped bound path gets no console warning at all. Keep it (or `/auto`) while developing, and rely on lint either way.
- `installFeatures` is idempotent (installing twice, or from two modules, is harmless); call it before `bootstrapState()`.

## 2. `<wcs-state>` State Definition (6 methods)

Resolution order: `state` attribute → `src` (.json/.js) → `json` attribute → inner `<script>` → wait for `setInitialState()`.

```html
<!-- 1. Reference a <script type="application/json"> by id -->
<script type="application/json" id="state">{ "count": 0 }</script>
<wcs-state state="state"></wcs-state>

<!-- 2. Inline JSON attribute -->
<wcs-state json='{ "count": 0 }'></wcs-state>

<!-- 3. External JSON -->
<wcs-state src="./data.json"></wcs-state>

<!-- 4. External JS module (export default {...}) -->
<wcs-state src="./state.js"></wcs-state>

<!-- 5. Inline script (most common. export default with type="module") -->
<wcs-state>
  <script type="module">
    export default { count: 0 };
  </script>
</wcs-state>

<!-- 6. Programmatic API -->
<script>
  const el = document.createElement('wcs-state');
  el.setInitialState({ count: 0 });
  document.body.appendChild(el);
</script>
```

`<wcs-state>` attributes: `mount` (graft this state onto the root tree at that path — see below) / `state` / `src` / `json` / `bind-component` (Web Component binding) / `enable-ssr`. **`name` was removed in v2** — it now fails fast with the migration text. As of v1.32, `src` resolves against the **document base URL** — so with `<base href="/ja/">` (the i18n basename pattern), a relative `src="./state.js"` fetches `/ja/state.js` and 404s. **Under a `<base>`, write the URL root-absolute**: `src="/state.js"`.

### Under a Content-Security-Policy the load path decides the directives (v1.26 docs)

| Method | What it does | CSP needed |
|---|---|---|
| `state="<id>"` / `json='{...}'` / `setInitialState()` | `JSON.parse` | **nothing extra** (data blocks are not executed) |
| `src="./state.js"` | normal `import(url)` | `script-src <origin>` |
| `src="./data.json"` | `fetch(url)` | `connect-src <origin>` |
| inner `<script type="module">` (method 5 — the default in every example) | text is extracted and imported through a **`blob:` URL** | **`script-src blob:`** |

**The page's nonce cannot rescue method 5** — a module loaded from a `blob:` URL does not inherit it. So under a strict CSP, move the state into `src="./state.js"`; opening `script-src blob:` means "allow all dynamically generated scripts", which gives away most of the reason for having a CSP. Other consequences worth knowing before you write the policy:

- **`<wcs-guard-handler>` is blob:-only with no escape hatch** — there is no `src=` form for a route guard, so using guards forces `script-src blob:`. Control access on the route-content side instead if the policy must stay strict.
- **`esm.run` needs two hosts** (`https://esm.run` *and* `https://cdn.jsdelivr.net`) because CSP re-checks the redirect target. The version-pinned direct path needs one.
- **Inline import maps need a nonce** (`@wcstack/autoloader` depends on one) and cannot take `integrity`.
- **`class.` / `style.` bindings do NOT need `style-src`** — they are CSSOM property assignments, not attribute parsing or `<style>` injection. And `data-wcs` is never evaluated: no `eval`, no `new Function` anywhere in the repo.
- **Trusted Types (`require-trusted-types-for 'script'`) is supported as of v2.2.0** (before that it threw in `<wcs-fetch>`'s `target=` HTML mode, `<wcs-layout>` expansion and DCC definition). The split is what matters. **Author-written strings are signed** by a shared identity policy named `wcstack` — `<wcs-layout>` templates and `new Worker(src)` — so add `trusted-types wcstack` to the policy **only if the page uses `<wcs-layout>` or `<wcs-worker>`**. **Remote and state data are never signed** — the `html:` / `innerHTML:` / `outerHTML:` / `srcdoc:` bindings and `<wcs-fetch target>` responses need a sanitizing policy *you* install, before the first fetch / layout / worker: `globalThis[Symbol.for("wcstack.trustedTypes.policy")] = trustedTypes.createPolicy("my-app", { createHTML: (s) => DOMPurify.sanitize(s, { RETURN_TRUSTED_TYPE: true }), createScriptURL: (s) => s })` from a nonced head script (bundles: `setTrustedTypesPolicy()` from `@wcstack/state` / `router` / `fetch` / `worker` — same slot). Without one those two sinks stay blocked, but v2.2 **reports once with the fix** instead of failing silently (the state property-write path swallows setter exceptions by design, so on ≤2.1 an `html:` binding under enforcement simply did nothing). DCC definition has no sink any more (it clones nodes). Chromium-only — elsewhere every path is a pass-through. Dynamic `import()` (inline state, guards, autoloader) is `script-src` territory, not a Trusted Types sink. Full sink table: `docs/csp.md` §7.
- **Diagnosing it**: a CSP-blocked dynamic `import()` only rejects with `Failed to fetch dynamically imported module`. state/router subscribe to `securitypolicyviolation` during evaluation and say `... was blocked by Content-Security-Policy` only when a violation was actually observed — if you instead see `Failed to evaluate the inline <script> of state "…"`, it is usually a syntax error in your state module (original error in `cause`).

### Mounting additional state (`mount=`) — v2

There is **one state tree per rootNode** (document or shadowRoot). To split state across modules, mount a **volume**: its data is grafted onto the root tree at the mount path, and bindings read it by prefix.

```html
<wcs-state src="./app.js"></wcs-state>               <!-- the root: exactly one per rootNode, required -->
<wcs-state mount="cart" src="./cart.js"></wcs-state> <!-- a volume grafted at `cart` -->
<div data-wcs="textContent: cart.total"></div>
```

- The **root `<wcs-state>` is required** and may be empty (`<wcs-state></wcs-state>`). Volumes with no root are a loud error.
- **Load order does not matter.** A volume connected before the root is grafted when the root registers; reads under a not-yet-loaded volume return `undefined` and are *not* reported as missing paths. **If the root fails to initialize (v2.4)**, volumes already waiting for it settle with a report of their own instead of waiting forever — and that is final: an orphaned volume does not re-graft when a corrected root connects later. Fix the root and reload the page. **As of v2.5 a volume that settles without grafting releases its mount slot** — orphaned, failed to load, failed to graft, or detached while it is still loading or waiting for its root — so a replacement element on the same mount path grafts; on ≤2.4 the slot stayed reserved for as long as that root node lived, and the replacement was rejected with `Volume slot "…" is already mounted on this tree.`, an error nothing awaiting the page ever saw, with a reload the only recovery. A released slot is taken back when the element is re-attached to the same root, or otherwise just before it grafts; if another volume took it meanwhile, that is reported and the graft is skipped. A grafted volume keeps its slot even while detached, a release only removes that element's own reservation (so removing a dead volume never frees a slot another one holds), and reads under a released path still resolve to `undefined`.
- **`setInitialState()` on a loaded volume element throws (v2.5)** — the graft copies the volume's data into the root tree once, so re-setting the element changed only its own reads and never reached the page (a silent no-op on ≤2.4, #268). Write the paths under the mount path on the **root** state instead. A volume that failed to graft throws as well.
- The mount path is **static and dotted** (`settings.theme` is fine). `*`, `$`, `#`, `@` and empty segments are rejected — at runtime and as `wcs/mount-path-invalid` (error) in lint. Changing `mount` after initialization is ignored, and **warns as of v2.1.0** (it was silently ignored on 2.0.0); setting it before initialization stays silent. Mounting onto a slot the root already owns throws, as does replacing a mount point's parent wholesale from the root (`this.settings = {...}` under `mount="settings.theme"`).
- A volume may declare **getters, `$watch`, `$listKeys`, `$updatedCallback`, `$connectedCallback` / `$disconnectedCallback`** — all relative to its own mount path. It may **not** declare `$streams` (raises); `$recursion` and `**` getters (v2.3+, §14) and `$scan` (v2.4+, §15) are refused before grafting; `$errorCallback` (v2.2+) is root-only — a binding failure is reported once, to the tree's owner, and a volume declaring it is ignored (as of v2.6 with the same warning that names the other root-only keys; silently on ≤2.5); and `$commandTokens` / `$eventTokens` / `$on` belong on the root.
- Cross-module reads are ordinary paths: a root getter reading `this["cart.total"]` tracks the dependency like any other. The v1 "cross-state read" problem disappears with the name dimension.

**Migrating from v1 named states** — `name=` and `path@name` were removed in v2:

| v1 | v2 |
|---|---|
| `<wcs-state name="cart">` | `<wcs-state mount="cart">` |
| `<wcs-state name="default">` | `<wcs-state>` (drop the attribute) |
| `total@cart` | `cart.total` |
| `total@default`, `.name@default` | `total`, `.name` |
| Light DOM `bind-component` + `name` | no `name` — the host wires it (§12) |

`name=` fails fast at runtime and `@` anywhere in a path is a **parse error**, both carrying the replacement text. Lint reports every site as `wcs/named-state-deprecated` (**error** in v2).

## 3. `data-wcs` Binding Syntax

```
property[#modifier[,modifier...]][|input filter...]: path[|output filter...]
```

- Multiple bindings are **separated by `;`**: `data-wcs="textContent: count; class.over: count|gt(10)"`. v3.0+: `;` and `|` split only outside quotes, so a quoted filter argument may contain them (`tags|join('; ')`, `parts|join(' | ')`) — on ≤2.x both broke the binding.
- There is **no `@state` selector** — `@` anywhere in a path is a parse error in v2. Read another module's state through its mount prefix (`cart.total`, §2).
- Filters on the left side (property side) apply in the **DOM→state input direction**: `<select data-wcs="value|number: selectedProductId">`
- Right-side filters apply in the state→DOM output direction.
- Multiple modifiers are comma-separated after a single `#`: `value#ro,init=none: path`
- **v3.0+ rejects malformed syntax with `[wcs/binding-syntax]`** (lint reports the same code, as an error): a second `#` (`value#ro#wo` — ≤2.x silently kept only `ro`; write `value#ro,wo`), a value after `else:`, modifiers or left-side filters on `for` / `if` / `elseif` / `else` / `...`, an unterminated quote in filter arguments, and an empty filter (`x|`, `x||y`).
- **A modifier never changes the kind of binding (v3.0+):** `radio#ro:` / `checkbox#ro:` stay radio / checkbox bindings. On ≤2.x a modifier turned them into a plain property named `radio`, so `#ro` on a radio group did nothing.
- **Empty values (v3.0+):** display surfaces — `textContent` / `innerText` / `innerHTML`, mustache, `attr.*`, `style.*` — treat `undefined` and `null` alike: the text is emptied, the attribute or style removed. Element inputs (every other property, spread) still skip `undefined` (the element keeps its own default) and clear on `null`. On ≤2.x `textContent:` also skipped `undefined` — a reused list row then kept the previous row's text — and `attr.*` wrote the string `"undefined"` / `"null"`.

### Property types

| Property | Description |
|---|---|
| `value` | Element value (two-way for input/select/textarea) |
| `checked` | checkbox/radio checked state (two-way) |
| `textContent` / `text` | Text (`text` is an alias) |
| `html` | innerHTML |
| `class.NAME` | CSS class on/off (toggled by truthiness) |
| `style.PROP` | CSS style property |
| `attr.NAME` | Attribute setting (SVG namespace supported) |
| `radio` | Radio group → single value (two-way) |
| `checkbox` | Checkbox group → array (two-way) |
| `onclick`, `on*` | Event handlers |

In addition, any DOM property name can be used (e.g. `disabled: createFetch.loading`).

### Modifiers

| Modifier | Description |
|---|---|
| `#ro` | Read-only (disables two-way binding) |
| `#prevent` | `event.preventDefault()` |
| `#stop` | `event.stopPropagation()` |
| `#onchange` | Two-way binding on the `change` event instead of `input` |
| `#init=state\|element\|auto\|none` | Binding authority for wcBindable elements. v1.22+: authority decides ONLY who wins the initial sync — two-way members flow both ways afterwards (in 1.21.x, `element`/`auto`/`none` suppressed state→element for the binding's whole lifetime). `#init=element` is the declarative load-before-bind form: `<wcs-storage data-wcs="value#init=element: todos">` keeps the persisted value at bind, then writes back normally |
| `#sync=call\|connect` | Snapshot read timing under element authority (`connect` also holds state→element writes until the initial conflict resolves) |

### Two-way binding (auto-enabled)

`<input>` (value/checked/valueAsNumber/valueAsDate), `<select>` (value, change event), `<textarea>` (value). `<input type="button">` is excluded.

### Mustache syntax

`{{ path|filter }}` in text nodes (enabled by default):

```html
<p>Hello, {{ user.name }}!</p>
<p>Count: {{ count|locale }}</p>
```

## 4. List Rendering (`for`)

```html
<template data-wcs="for: users">
  <div>
    <span data-wcs="textContent: users.*.name"></span>  <!-- full path -->
    <span data-wcs="textContent: .name"></span>          <!-- dot shorthand -->
  </div>
</template>
```

- No key attribute needed (value-based diffing). Arrays must **always be reassigned as new arrays** (`concat`/`toSpliced`/`filter`/`toSorted`/`toReversed`/`with`). The runtime does not observe `push`/`splice`/`sort` or direct index writes such as `this.items[0] = value`; v1.22.2+ lint reports these as `wcs/array-mutation` / `wcs/array-index-assign`.
- Dot shorthand: `.name` → `users.*.name`, `.` → `users.*` (element value for primitive arrays); `.name|uc` also works (`.name@state` went away with the name dimension).
- `{{ .name }}` also works inside Mustache.
- Row identity is the element **value** — for objects, the reference. Every non-destructive array method preserves references, so sorting and filtering are structurally keyed and the "wrong key" class of bug cannot occur.
- **Swapping or replacing rows by writing elements is correct from v2.5.** `this.$resolve("items.*", [0], b)` and `this["items.0"] = c` are element *writes*, not array mutations, so they are legitimate. Once the swap is complete the list is re-rendered as a replacement of the order before the writes: the row **blocks travel with their values**, and so do a row's `$1` and any DOM state the bindings do not own (text typed into an unbound input). Writing a value that was **not** in the list replaces that row in place — its block stays where it is and its bindings, including an unbound row getter, show the new value, so an input bound to that row keeps focus while you type. In a list of primitives equal values cannot be told apart, so writes that end in a reordering of the same values count as a swap. The completed swap is queued **render-only**: it lands nothing, so `$watch` fires neither on `items` (the array reference never changed) nor on `items.*` for rows that merely moved — a *replacement* does land on `items.*`, with `prev` = the row it replaced. Recorded gap: `$watch` / `$scan` on a path inside a replaced row's *nested* list (`groups.*.items.*`) does not land for that row, though the page and the state are correct. **On ≤2.4** the written value was pinned to the position's old row and the list was never re-rendered, so page, path reads, writes and `$1` all silently disagreed with the array — pin ≥2.5.0.

### `$listKeys` — identity across a refetch (v1.26+)

The exception to value-based identity is **data that arrives as freshly created objects**: `(await fetch(...)).json()`, `JSON.parse` out of storage, a full-snapshot WebSocket/SSE push, a worker `postMessage`. No row matches by reference, so every row is torn down and rebuilt — and DOM state the bindings do not own (focus, an in-progress IME composition, `<details>` open/closed, in-row scroll position, `<canvas>` pixels, `<video>.currentTime`) is not merely lost but **shuffled between rows**, because the content pool redistributes LIFO. Declare a key and rows survive the refresh:

```javascript
{
  items: [],
  $listKeys: {
    "items": "id",                          // field name
    "items.*.children": (row) => row.uid,   // function, for composite keys
  },
}
// rows are all-new objects, but they are matched by id: DOM, focus and
// <details> state are kept and only the fields that actually changed are written
this.items = await (await fetch("/api/items")).json();
```

- **Opt-in and per-path.** Undeclared lists behave exactly as before at zero extra cost. Nesting is opt-in too — only declared paths are key-matched — so it can be adopted one list at a time.
- **An unchanged refresh is free**: no field writes, no DOM work.
- **Rows must be plain objects**, and keys must exist and be unique. A duplicate, missing, or class-instance key is an immediate error rather than silent degradation. The declaration itself is validated when the state is installed: empty paths, empty segments, a trailing `*` (declare `items`, not `items.*`), non-flat key field names (no `.`/`*`), and `Object.prototype` names are all rejected.
- **A field that disappears from a row is cleared to `null`** — `null` is this package's explicit "clear" vocabulary, while `undefined` means "no value" and skips the write.
- **The stored array is rebuilt from the matched row objects**, so after assignment `this.items !== theArrayYouAssigned`.
- Use it when rows hold unbound DOM state; a purely text-rendering list gains nothing but consistency. `@wcstack/lint` and the VS Code extension follow the declaration, so `for: items.*.children` completes and validates even when `items` starts as `[]`.

### Nested loops

```html
<template data-wcs="for: regions">
  <template data-wcs="for: .states">        <!-- .states → regions.*.states -->
    <span data-wcs="textContent: .name"></span> <!-- → regions.*.states.*.name -->
  </template>
</template>
```

### Loop index

- Inside getters/handlers: `this.$1` (outer), `this.$2` (inner), ...
- Inside templates: `{{ $1|inc(1) }}` (1-based row number)
- `.length` paths also work: `data-wcs="if: cart.items.length|gt(0)"`

## 5. Conditional Rendering (`if` / `elseif` / `else`)

```html
<template data-wcs="if: count|gt(0)"><p>Positive</p></template>
<template data-wcs="elseif: count|lt(0)"><p>Negative</p></template>
<template data-wcs="else:"><p>Zero</p></template>
```

`else:` **requires the trailing colon** (no right side). Nested `if` is allowed.

**A structural binding must be the only binding in its `data-wcs`.** `for` / `if` / `elseif` / `else` sharing the attribute with anything else (`data-wcs="for: items; class.on: x"`) raises `[wcs/template-syntax]` at parse time and takes the page down; put the other bindings on elements inside the template. Lint checks the same shape as of v1.29.

## 6. computed (path getters) and the Proxy API

**Getters on a plain object**, not class syntax. Dot-path string keys + `*` wildcard:

```javascript
export default {
  users: [{ id: 1, firstName: "Alice", lastName: "Smith" }],
  get total() { return this.price * (1 + this.tax); },          // top level
  get "cart.totalPrice"() { /* nested computed */ },
  get "users.*.fullName"() {                                     // wildcard
    return this["users.*.firstName"] + " " + this["users.*.lastName"];
  },
  set "users.*.fullName"(value) { /* path setter, two-way capable */ },
  get "categories.*.items.*.label"() { /* multiple wildcards */ },
};
```

- Inside a getter, `this["users.*.firstName"]` auto-resolves to the current loop element. Automatic dependency tracking, per-address caching.
- Direct numeric-index access works: `this["users.0.name"]`, `` this[`cart.items.${i}.quantity`] += 1 ``.
- Chaining into a getter's returned object works: `this["cart.items.*.product.price"]`.

### Getters must be pure with respect to state (documented in v1.31)

The cache is invalidated **only** through the dependency graph, and the graph records only what the getter read **through `this`**. Everything else is invisible to invalidation, so the first value computed is the value you keep — forever, with no warning:

```javascript
get stamp() { return `${this.label} @ ${Date.now()}`; }  // ❌ Date.now() untracked — never recomputes
get theme() { return document.body.dataset.theme; }       // ❌ the DOM is untracked
get total() { return this.price * exchangeRate; }         // ❌ a module variable is untracked
```

The rule: **read only through `this`; never write state or touch the DOM from a getter.** When an untracked input genuinely must participate, put it into state and assign to it (`now: Date.now()` seeded, then `this.now = Date.now()` on a timer in `$connectedCallback`), or use the escape hatches — `$trackDependency(path)` (register an extra dependency), `$postUpdate(path)` (announce an untracked change from outside), `$untrackDependency(fn)` (read without registering). Getters that throw are not swallowed: the exception surfaces where the getter was evaluated (a binding apply, a `$watch` evaluation, or your own read). Mutually-recursive getters are a reported cycle as of v1.31 (`wcs/getter-cycle`, naming the getters) instead of a broken internal error.

### Dependency tracking boundaries (v2.2.0 README table)

Three rules decide what the graph sees. None matters until you cross one, and the symptom is always *a value that stops updating with no error*:

| Rule | What it looks like when crossed |
|---|---|
| **Only path reads through `this` are tracked.** `this.form` tracks `form`; `this["form.name"]` tracks `form.name`; **`this.form.name` tracks `form` only** — the `.name` is a plain property access on the object that came back | A getter reading `this.form.name` does not re-run when a bound `<input data-wcs="value: form.name">` changes — read `this["form.name"]`. This is the one rule static analysis catches: `wcs-validate` and the VS Code extension report **`wcs/getter-untracked-read`** (warning, v2.2) when a getter reads `this.form.name` and the document writes `form.name` somewhere (a `value:` / `checked:` binding, a spread, an I/O node output, `this["form.name"] = …`, `$setAll`, a `mount=` volume); a root that is only ever replaced wholesale (router params, a `$streams` fold) is left alone, and so are array roots (`this.items[0].name` — `items` suffices) |
| **Reads inside a setter are not tracked.** A setter is an imperative assignment, not a derivation | A setter that reads `this.a` to decide what to write does not run again when `a` changes — only a getter re-runs. `$untrackDependency(fn)` applies this rule to a getter on purpose |
| **The same-value guard is primitive-only.** An `Object.is`-equal primitive write is dropped before anything is enqueued; an object or array write always passes, even the same reference | Assigning the same string again fires nothing; assigning the same object again re-fires its bindings and `$watch` (`semantics: "event"` properties are exempt either way) |

The storage "persist a form as one object" recipe (`io-node-catalog.md` §2) is where the first rule bites most often: the accessor pair's getter must read `this["form.name"]`, not `this.form.name`.

### Demand roots — what makes a getter run (documented in v1.31)

Path getters are **lazy**; "does this getter run?" depends on where demand comes from, and there are exactly **three roots**: a **live DOM binding** (demand disappears with the element!), a **`$watch` declaration** (headless), and a **`$streams` `args` function** (evaluated on start and every restart). **`$updatedCallback` is not a root** — it reports what the bindings did. Logic that must not depend on what is rendered belongs on `$watch` or `args`; a display-only element that is secretly the only demand root is the accident `wcs/updated-callback-unbound` now catches statically. Knowing whether a getter is evaluated means inspecting all three places — the linter and the devtools coverage view exist to make a machine do that cross-check.

### Proxy API (via `this`)

| API | Description |
|---|---|
| `this.$getAll(path, indexes?)` | Get all values of a wildcard path as an array (for aggregation). `indexes` is a **prefix** over the path's wildcards — missing levels expand fully, `[]` always means "every match"; **more than the `*` count throws `wcs/index-arity`** (v1.31; earlier versions silently dropped the surplus and returned a plausible wrong value). **Omitting `indexes` entirely defaults to the enclosing loop context** (v1.32) — `this.$getAll("regions.*.prefectures.*.population")` inside a `regions.*` getter narrows to the current region. If the path shares **no** wildcard level with a loop context that holds indexes, `$getAll` **throws** rather than silently reading everything — pass `[]` explicitly for "every match" there. **v2.3**: an `indexes` that is not an array (`null`, a number) throws a diagnostic naming the argument and the two valid forms, instead of a raw `TypeError` |
| `this.$setAll(path, indexes, value, options?)` | v1.32+: write to **every** address a wildcard path matches, in place — see below |
| `this.$resolve(path, indexes, value?)` | Read/write at specific indexes. The index count must match the path's `*` count **exactly** (v1.31: `wcs/index-arity`; loop-context-derived indexes when the argument is omitted are deliberately unchecked). **v3.0+: the argument count decides** — two arguments read, three write (`undefined` included); ≤2.x read when the third argument was `undefined`, and v2.6 warns on that form (§16). **Read with two arguments** on every version. On a readonly proxy (`createState("readonly", …)`) the write throws `This state is readonly.` in v3.0+, and so does `$setAll` (≤2.x let both write through a readonly proxy) |
| `this.$postUpdate(path)` | Manually emit an update notification |
| `this.$trackDependency(path)` / `this.$untrackDependency(fn)` | Manually register / suppress dependencies |
| `this.$eq(path, key)` / `this.$eqPath(path, keyPath)` / `this.$eqIndex(path, level?)` | v2.6+: keyed subscription — "is `path` equal to this row's key?" without a dependency on `path` from every row. See below |
| `this.$stateElement` | IStateElement access |
| `this.$1`, `this.$2`, ... | Loop indexes. **v2.3**: `$N` must name an existing wildcard level — `$1`…`$128`, no leading zeros; `$129` / `$0` / `$01` now **throw** (`wcs/index-param-range`) instead of resolving as an ordinary property and reading `undefined` |

### `$setAll` — bulk writes that keep the array (v1.32+)

The write-side counterpart of `$getAll`. The point is not brevity but **list identity**: `this.users = this.users.map(...)` throws away list indexes, per-row getter caches, and the render diff; `$setAll` decomposes into in-place per-row writes, so the array survives.

```javascript
this.$setAll("users.*.selected", [], e.target.checked);            // broadcast (same value everywhere)
this.$setAll("users.*.selected", [], cur => !cur);                 // mapper: (current, ...indexes)
this.$setAll("users.*.score", [], (cur, i) => i < 3 ? cur * 2 : undefined);  // undefined = skip this row
this.$setAll("matrix.*.*", [0], 0);                                // indexes prefix: row 0 only
this.$setAll("users.*", [], rows, { spread: true });               // one entry per address, in match order
```

- Three forms: a **function** is a mapper; **anything else broadcasts** (arrays included — the target may itself be array-valued); an array **plus `{ spread: true }`** hands one entry per matched address, and a length mismatch throws rather than misaligning.
- `undefined` is never written ("skip this address" in all three forms — a mapper that forgets to `return` wipes nothing); use `null` to clear. Returns the number of addresses written.
- `indexes` is a prefix exactly as in `$getAll` but **required** — writes get no implicit loop context, so inside a `for` template `$setAll("users.*.selected", [], true)` still means *every* user, never the current row.
- Not a shortcut for the dependency walk: each write is enqueued individually (cost matches the hand-written loop); rendering still coalesces into one batch.

**A path's depth is fixed in its string.** `nodes.*.children.*.total` is depth 2 and nothing stretches it to 3. For a tree whose depth is decided by the data, declare `$recursion` and write `**` — §14.

### Keyed selection — `$eq` / `$eqPath` / `$eqIndex` (v2.6+)

A row getter that answers "is this row the selected one?" is where dependency tracking scales worst: `get "items.*.selected"() { return this.$1 === this.selectedIndex; }` (or `this["items.*.id"] === this.selectedId`) makes **every** row depend on the selection path, so one click re-evaluates the whole list — about 20 ms at 10,000 rows. The keyed forms read the selection path **without** a dependency and subscribe each row under **its own key**, so a write to the path re-evaluates only the row that was selected and the row that becomes selected (0.2 ms at 10,000 rows):

| API | Key | Selection follows | Notes |
|---|---|---|---|
| `this.$eq(path, key)` | any value you pass | the key | Pass a tracked read (`this["items.*.id"]`) when the key itself can change, `this.$untrackDependency(() => …)` when it cannot |
| `this.$eqPath(path, keyPath)` | the value at `keyPath` (its wildcards resolve to this row) | the id | Reads the key untracked too, so reordering or replacing the list never re-evaluates the rows. **Survives sorting and removal** — the default choice |
| `this.$eqIndex(path, level = 1)` | this row's index (`$1`; `level` picks the wildcard in a nested list) | the position | Unlike reading `$1`, the getter is not recorded as index-dependent — the list diff re-keys moved rows, so removing a row re-evaluates at most two rows |

```javascript
export default {
  items: [],
  selectedId: null,
  get "items.*.selected"() { return this.$eqPath("selectedId", "items.*.id"); },   // by id
  select(e, i) { this.selectedId = this[`items.${i}.id`]; },          // (event, ...listIndexes)
};
```
```html
<template data-wcs="for: items">
  <li data-wcs="class.selected: .selected; onclick: select; textContent: .name"></li>
</template>
```

Rules (verified against 2.6.1 and 3.0.0):

- **What reaches the rows** — a write to `path` of any value, objects included (`this.selected = row` with `$eq("selected", this["items.*"])`), and a write that replaces an object above it (`this.selection = { id }` under `$eqPath("selection.id", …)`): the row that was selected and the row that becomes selected. **On 2.6.0 both failed silently** — an object key left the previous row selected (two rows showed as selected), and a parent replaced wholesale re-evaluated no row. Pin ≥2.6.1.
- **A getter as `path`**, or a path under one (`$eq("current.id", …)` with `get current()`), falls back to an ordinary tracked read from 2.6.1: the selection is correct, but a change re-evaluates every row, as without the keyed form — point `path` at the written state (`selectedId`) to keep the two-row cost. On 2.6.0 it never re-evaluated the rows.
- **Keys compare like `Map` keys** (`Object.is`, except `+0`/`-0` and `NaN`/`NaN` count as equal), so no type coercion: a selection written as the string `"2"` by an `<input>` / `<select>` never matches numeric ids — convert on the way in (`value|number: selectedId`).
- `$eqPath` reads the key without a dependency, so a row whose key changes **in place** is not re-evaluated by that change — use it for identities that do not change (ids), and `$eq` with a tracked key read when the key itself is live.
- They subscribe only when evaluated inside a getter; called from a method or a handler, `$eq` / `$eqPath` just return the comparison. `$eqIndex` needs a list row: in a getter outside a row it throws `$eqIndex("…") needs a list row scope.`, and a `level` with no list index at that depth throws too. A row's subscription is dropped when the list diff removes the row.
- Types: `defineState` and `wcs-tsc` 2.6 declare all three. The published VS Code extension (1.15.0) predates them, so its inline-script typing may flag `this.$eqPath` until its next release — the runtime is unaffected.
- **DevTools (v3.0+):** the `@wcstack/devtools` State pane counts the subscriptions per path under **Keyed selection** — rows, keys, `$eqIndex` list watchers and the last value — and marks a getter path that fell back to a tracked read with a `tracked` badge. Use it to confirm a selection is really keyed.

### Iron rule of state updates

```javascript
this["user.name"] = "Bob";   // ✅ path assignment → DOM update
this.user.name = "Bob";      // ❌ runtime ignores it; lint warns
```

## 7. Filters (fixed at 46 built-ins; no custom registration API)

- Comparison: `eq` `ne` `not` `lt` `le` `gt` `ge`
- Arithmetic: `inc` `dec` `mul` `div` `mod` `abs` `clamp` (v1.27+)
- Number formatting: `fix` `round` `floor` `ceil` `locale` `percent` `unit` (v1.27+)
- String: `uc` `lc` `cap` `trim` `slice` `substr` `pad` `rep` `rev` `truncate` `join` (v1.27+)
- Type conversion: `int` `float` `boolean` `number` `string` `null`
- Date: `date` `time` `datetime` `ymd` `hms` (v1.27+)
- Truthy/default: `truthy` `falsy` `defaults`

With arguments: `gt(10)`, `substr(0,10)`, `pad(5,0)`, `locale(ja-JP)`, `ymd(/)`, `eq('admin')` (quotes allowed, bare allowed, comma-separated). Chaining: `price|mul(1.1)|round(2)|locale(ja-JP)`. Do transformations the built-ins cannot express in a getter.

**Filter arguments are text in 2.x — `eq(true)` never matches a boolean.** `eq` / `ne` compare a number value numerically and everything else with `===` against the argument *string*, so on 2.x `done|eq(true)` is always `false` for a boolean `true` (and `eq(null)` is always `false` for `null`), and `defaults(null)` falls back to the text `"null"`. 3.0 reads an unquoted `true` / `false` / `null` as the typed value, and v2.6 warns on every such site (`wcs/v3-migration`, §16). Write what is correct on both: bind a boolean directly (`class.done: done`, `hidden: done|not`), and quote the argument (`eq('true')`) only when the value really is that text. Two more 3.0 changes the v2.6 warning names: **more arguments than a filter takes** are silently ignored on 2.x and rejected by 3.0 (lint already reports them as `wcs/filter-arity`, an error), and `0n` through `truthy` / `falsy` / `defaults` counts as truthy on 2.x but falsy on 3.0.

Contracts of the six v1.27 additions:

- `abs` — `Math.abs`; number input required.
- `clamp(min, max)` — both arguments required; saturates into `[min, max]`. Same family as `round`/`floor`: a wire conversion, so it belongs on the binding, not in state.
- `unit(u)` — appends any suffix: `width|unit(px)` → `"40px"`. **Accepts strings as well as numbers on purpose** — the useful chains run through `fix`/`percent`, which return strings. `null`/`undefined` pass through untouched (never `"undefinedpx"`), so "undefined skips the write, null clears" survives the filter. The canonical style-binding chain that keeps presentation out of state: `style.height: samples.*.cpu|clamp(0,100)|fix(0)|unit(%)`.
- `join(sep?)` — array → string; default separator is `", "` (a bare `","` is what `String()` already does, which would make `|join` a no-op).
- `truncate(n, suffix?)` — `n` counts **kept characters** (matching the `slice(0, n)` reading), suffix defaults to `…`; a string at or below the limit is returned untouched.
- `hms(sep?)` — the counterpart of `ymd`: fixed zero-padded `HH:MM:SS` from a Date, locale-independent, separator defaults to `:` — for when locale-formatted `time` is not stable enough.

**Argument trimming is outside-quotes only (fixed in v1.27).** Whitespace inside quotes is literal: `pad(5, ' ')` pads with a space and `join(' / ')` works. On ≤1.26 the quoted whitespace was stripped too — `pad(5, ' ')` silently became a no-op — so if you must target an older CDN pin, avoid whitespace-bearing filter arguments.

**The default locale is `<html lang>` (BREAKING in v1.32; was `'en'`).** The four locale-dependent filters — `locale`, `date`, `time`, `datetime` — read `config.locale`, which now defaults to `<html lang>`, falling back to `'en'`. Always set `<html lang>`; it is the one way the CDN one-liner can set the locale at all. An explicit `bootstrapState({ locale })` still wins; an invalid BCP-47 tag is reported and ignored. **Changing `config.locale` later re-renders nothing** (it is a global setting, not state) — set the language before the page renders (markup, or a synchronous `<head>` script). Per-call overrides (`price|locale(fr-FR)`) are fixed at bind time. For pages that switch language without reloading, translations belong on a path, not in a filter (`docs/i18n-design.md`).

**v3.0: filter names resolve when the bindings are planned, not when the text is parsed.** An unknown filter still throws `[wcs/filter-unknown]` with a did-you-mean — only the moment moves (it now fails when the binding is set up, not while the attribute is read). On a split-entry page (§1) the core answers only `not` (which `if` / `else` need); every other built-in comes from `@wcstack/state/features/formats`, and without it they throw the same `[wcs/filter-unknown]`. `/auto` and the full entry install them all. There is still no public registration API.

**v3.0 filter arguments.** The argument count is checked at runtime too (`[wcs/filter-arity]`, the bounds lint already used): `join(a,b)` throws "accepts at most 1 argument(s)". Unquoted `true` / `false` / `null` / numbers are typed literals, quoted arguments are strings: `done|eq(true)` matches `true` (≤2.x compared with the string and never matched), `eq('true')` does not, `eq(null)` matches `null`; numbers and strings compare as before, so a form value `"1"` still matches `eq(1)`. `defaults(v)` returns the typed value (`defaults(0)` → `0`). `truthy` / `falsy` / `defaults` use JavaScript truthiness (`0n` is falsy; ≤2.x `truthy(0n)` was `true`).

## 8. Event Handling

```html
<button data-wcs="onclick: handleClick">Click</button>
<form data-wcs="onsubmit#prevent: handleSubmit">...</form>
```

```javascript
export default {
  items: ["A", "B", "C"],
  handleClick(event) { /* this = state proxy */ },
  removeItem(event, index) {        // (event, ...listIndexes) when inside a loop
    this.items = this.items.toSpliced(index, 1);
  }
};
```

- Signature: `(event, ...listIndexes)`. Inside loops, the enclosing loop indexes are appended after the event.
- **`onclick:` binds a method name only and cannot pass arguments** — for argument variants, define zero-argument wrapper methods (e.g. `filterAll() { this.filterBy(""); }`).
- Writing `$command.<name>` on the right side emits directly: `<button data-wcs="onclick: $command.refreshList">`.

## 9. command-token / event-token

### command token (state → element method invocation)

```html
<wcs-state>
  <script type="module">
    export default {
      $commandTokens: ["refreshList"],
      onClick() { this.$command.refreshList.emit("/api/users", { method: "GET" }); }
    };
  </script>
</wcs-state>
<!-- Subscriber side. The right side must be $command.<name> (bare names not allowed) -->
<wcs-fetch data-wcs="command.fetch: $command.refreshList"></wcs-fetch>
```

- Declare with `$commandTokens: string[]` → `this.$command.<name>.emit(...args)`. Arguments are forwarded verbatim to the subscribing element's method (not awaited; wait on Promises with `Promise.all(token.emit(...))`).
- One token fans out to multiple elements; subscribe order is preserved.

### event token (element → state)

```html
<wcs-state>
  <script type="module">
    export default {
      users: [],
      $eventTokens: ["userCreated"],
      $on: {
        userCreated(state, event) {          // state is the first argument, not this
          state.users = state.users.concat(event.detail);
        },
        // emitter inside a loop: (state, event, ...listIndexes)
      }
    };
  </script>
</wcs-state>
<!-- The key is the wcBindable property name (not the raw event name). The token name is bare (no $) -->
<my-form data-wcs="eventToken.created: userCreated"></my-form>
```

- The event-token surface fires on **every** dispatch, including a repeat of the same payload — it is the occurrence channel, so prefer it over a property binding whenever "it happened again" is the thing you care about. (On I/O nodes, properties declared `semantics: "event"` are also exempt from the same-value guard as of v1.24; see `io-node-catalog.md` §0.)
- **`$on` handlers are not awaited.** That is specified behavior and did not change in v1.24; what changed is that an async handler which rejects is now caught and reported through `console.error` naming the state and the handler, instead of surfacing as a bare unhandled rejection. It is still neither propagated nor awaited, so never sequence work on the return value — let the async work write its own state slot when it settles. Synchronous throws still propagate as programmer errors.
- **Re-attaching the root `<wcs-state>` keeps both registries (v2.4)**. Moving the element in the DOM (`host.remove(); document.body.appendChild(host)`) used to throw away the command- and event-token registries, while `$on` subscribes only when the state is set and a `command.<method>:` binding only when its value is applied — so afterwards every element event and every `$command.<name>.emit()` silently reached a fresh token with zero subscribers. Both registries now survive a disconnect, as the `$streams` and `$watch` registries already did. Nothing fires while the element is disconnected, and a re-set still replaces the `$on` subscriptions.

### state ↔ wcs-fetch working example (skeleton of the users-crud example)

```html
<script type="module" src="https://esm.run/@wcstack/fetch/auto"></script>
<script type="module" src="https://esm.run/@wcstack/state/auto"></script>

<wcs-state>
  <script type="module">
    export default {
      $commandTokens: ["refreshList"],
      $eventTokens: ["userResponded"],
      // 1 fetch = 1 state slot. For outputs the element is the authority, so seed with real initial values (null)
      listFetch: { value: null, loading: false, error: null, status: 0 },
      createFetch: { url: "/api/users", method: "POST", manual: true,
                     body: { name: "" }, value: null, error: null, loading: false, status: 0 },
      get "listFetch.url"() { return "/api/users"; },   // compute the URL with a nested getter inside the slot
      get listRows() { return this["listFetch.value"] ?? []; }, // for: requires an array, so null-guard
      $on: {
        userResponded: (state, event) => {
          const status = event.detail?.status ?? 0;
          if (status < 200 || status >= 300) return;   // wcs-fetch:response also fires on errors
          state.$command.refreshList.emit();
        },
      },
    };
  </script>
</wcs-state>

<wcs-fetch data-wcs="...: listFetch; command.fetch: $command.refreshList"></wcs-fetch>
<wcs-fetch data-wcs="...: createFetch; eventToken.value: userResponded">
  <wcs-fetch-header name="Content-Type" value="application/json"></wcs-fetch-header>
</wcs-fetch>
```

### spread binding (`...`)

- `...: target` wires all wcBindable properties + inputs at once. `commands`/event tokens are excluded (explicit wiring required).
- Inside for: `...: storesFetches.*` (recommended) or `...: .`.
- Last-wins override: `...: usersFetch; status: alternateStatus`.
- Right-side filters are an **error**. Elements without a wcBindable declaration are an **error** — statically caught for the built-in helper tags (`wcs-fetch-header` / `wcs-fetch-body` / `wcs-infinite-scroll` / `wcs-voice`) as `wcs/spread-no-bindable` since v1.30. An empty-but-declared contract (`wcs-noise`) is legal: it expands to zero props.
- `undefined` state paths are write-skipped for the property (the element default survives). Clear by assigning `null`. (Spread targets element inputs; display surfaces empty on `undefined` as of v3.0 — §3.)

## 10. `$watch` — headless change subscription (v1.27+)

`$updatedCallback` is binding-driven: a value nothing renders is invisible to it. **`$watch` fires on state changes whether or not the path has a DOM binding** — it is the state-only watcher that did not exist before v1.27.

```javascript
export default {
  isLoading: false,
  items: [],
  $listKeys: { items: "id" },          // required for the row watch below to be headless
  $watch: {
    // edge detection is yours: compare cur/prev in the handler
    isLoading(cur, prev) {
      if (cur === true && prev === false) { this.startedAt = Date.now(); }
    },
    // wildcard paths fire once per changed row; trailing args are this scope's indexes
    "items.*.price"(cur, prev, index) {
      this.lastPriceChange = `#${index}: ${prev} → ${cur}`;
    },
  },
};
```

- **Handler contract**: `(cur, prev, ...indexes)`, `this` = **writable** state proxy (writes land in the next update batch); the return value is ignored and never awaited. `cur` is the settled value at drain time; `prev` is the value at the start of the batch (first-write-wins).
- **`prev` comes only with a primitive write** — it reuses the old value the same-value guard reads before writing a primitive (zero extra cost), so it is `undefined` when the *new* value is a reference type, for `$postUpdate`, and when `config.sameValueGuard` is off. A primitive written over an object passes that object as `prev` (the v2.4 docs pin the axis as the value written; the older "scalar-only" wording meant that).
- **No firing condition of its own**: it fires for whatever landed in the batch. Equal primitive writes are already dropped before enqueue (effectively change-only firing), but a `semantics: "event"` occurrence write is *not* dropped and fires with `cur === prev`.
- **Watching a getter makes it eager**: evaluated once at connect and again at the end of every batch touching its dependencies (`prev` = previous evaluation) — an unrendered computed can now fire. You pay that evaluation per batch, and exceptions inside the getter surface through the watch. **Wildcard getters (`items.*.tax`) are not made eager** (priming would sweep the whole list): that form fires only when also DOM-bound, and its `prev` is always `undefined`.
- **Ordering**, three fixed layers, only the middle one yours: mechanisms `$updatedCallback` → `$scan` (v2.4, §15) → `$watch` → `$streams` restart; between handlers, declaration order in `$watch`; between rows of one path, ascending indexes. One thing moves the mechanism layer (v1.32): a `<wcs-view-transition>` accepting the `state` participant puts binding application — and with it `$updatedCallback` — on a **frame**, while `$scan`, `$watch` and the `$streams` restart stay on the original microtask, so the order becomes `$scan` → `$watch` → `$streams` restart → `$updatedCallback` while that tag is present (`for="router"` on the tag keeps state's timing untouched).

Key rules (each of these fails silently or surprisingly if ignored):

1. **Scope-relative paths only** — a key is a path in the declaring scope's own vocabulary (a volume declares relative to its mount point). `@` is a parse error; there is no cross-state axis left to reject.
2. **A key cannot start with `$`** — so `$streamStatus.<name>` / `$streamError.<name>` cannot be watched directly. The idiom: mirror through a one-line non-`$` getter (`get streamStatus() { return this["$streamStatus.pageResult"]; }`) and watch that — the eager-getter rule is exactly what makes it work unrendered. It was the v1.27 commit boundary for `$streams`; since v2.4 the accumulation itself belongs in `$scan` (§15), and the status mirror only drives side effects (see `io-node-catalog.md`, the intersect-scroll recipe).
3. **Intermediate values are not observable** — a batch `a → b → c` fires once with `cur = c`, `prev = a` (same contract as binding updates).
4. **A headless wildcard row watch requires `$listKeys`** — path expansion is driven by the list's `for` binding, and declaring a watch deliberately does not register the path as a list. With neither a rendered `for` nor `$listKeys`, assigning the array fires the row watch **zero** times. And without `$listKeys`, a whole-array assignment fires **every** row with `prev === undefined`; with it, the key match decomposes into per-field writes, so only changed rows fire and `prev` is a real scalar. Scalar paths (including nested `user.name`) are headless with no such condition. **As of v2.4 row firing follows the list as it stands when the batch drains**: a row written and then removed, replaced or cut off in the same job does not fire, a row that only moved does not fire, each position fires at most once, and replacing a nested list with a longer array fires the added rows too. On ≤2.3 that replacement fired only the old positions, removed rows fired with whatever row now sat there (or an evaluation error), and a `$resolve` into the nested list right after the structural write threw `ListIndexes not found`.
5. **Handler exceptions are isolated** — reported to the console (and the devtools timeline as `state:watch-error`), remaining watches and stream restarts still run. This differs from `$connectedCallback`/`$updatedCallback`, which fail loudly.
6. **Write chains are bounded at 32 links** — a handler's writes form a new batch; mutually-writing watches are cut off with a console error (`state:watch-chain-limit` in devtools). Nothing is rolled back.
7. **Not executed on a mounted `bind-component` scope (v2)** — a mounted component does not run declaration surfaces at all; the declaration is ignored with a **one-time console warning** naming the root state (`wcs/mount-dollar-declaration`; v1 blanked it silently). Declare it on the root, or on a volume (`<wcs-state mount>` hosts `$watch` / `$listKeys` / `$updatedCallback`; `$streams`, `$recursion` (v2.3) and `$scan` (v2.4) stay root-only). A plain, unwired Shadow child owns an independent tree and can still declare it.
8. **SSR never runs watches** — otherwise handler side effects would execute on both server and client.

Tooling knows the declaration (v1.27): `@wcstack/lint` and the VS Code extension validate it — `wcs/watch-declaration-invalid` (error: `@` cross-state key, `$`-prefixed key, empty path segment, non-function handler, and — v1.29 — a whole `$watch` value that is definitely not an object) and `wcs/watch-path-missing` (warning: the key does not exist in the state definition — unlike a binding typo, which visibly fails to render, a `$watch` typo silently never fires). Since v1.28 the runtime's own declaration errors carry the same `[wcs/watch-declaration-invalid]` code plus a lint pointer, so console and CLI speak one vocabulary; v1.31 adds the missing-path side — a `$watch` key that provably does not resolve gets a `console.warn` (`wcs/watch-path-missing`) at declaration time, even for a single segment. And v1.29 makes firing measurable: the runtime emits `state:watch-fired`, which the devtools coverage tab joins against the declared `$watch` keys — each path shows *fired ×N*, *never*, or *prerequisite-missing*, distinguished from "never" so the view does not cry wolf. Since v1.30 the prerequisite check is exact — a wildcard's list counts as satisfied when it is `for`-bound **or** `$listKeys`-declared (the same two conditions rule 4 above states for headless firing), and when neither holds the note says assertively: "this watch can never fire".

## 11. Other Features

- **Lifecycle**: On the state object: `$connectedCallback` (async allowed, awaited, runs on every reconnection), `$disconnectedCallback` (sync only), `$updatedCallback(paths, indexesListByPath)` (async allowed, not awaited), `$errorCallback(error, info)` (v2.2+, see next bullet). On the Web Component side: `async $stateReadyCallback(stateProp)`.
- **`$errorCallback(error, info)` is the in-page error boundary for bindings** (v2.2+). A binding whose application throws (a path getter / filter threw, a structural directive failed) is isolated — the rest of the batch applies, nothing is rolled back — and reported with `console.error` unless the **root** state declares this hook; then the report comes to it instead. `info` = `{ path, bindingType, node }` (`path` as written in `data-wcs`, wildcards intact); `this` is the writable proxy, so the canonical shape is ``this.loadError = `${path}: ${error.message}` `` and a plain `textContent:` bind. Runs once per failed binding after `$updatedCallback`, not awaited, own exceptions isolated; DevTools still gets `state:binding-apply-error`. Root-only: ignored on a `mount=` volume or a mounted component — silently on ≤2.5, and as of v2.6 named by the warning that already lists the other root-only keys (as 3.0 does). Does **not** cover `$watch` handler failures or exceptions thrown by `$connectedCallback` / `$updatedCallback`.
- **`$updatedCallback` is binding-driven, not write-driven** (spelled out in v1.26): `paths` lists only the paths whose **live DOM bindings** were applied in that drain. A state write with no binding never calls it and never appears in `paths`. So it cannot be used as a headless watcher — that job belongs to `$watch` (§10, v1.27+), which fires with no binding at all.
- **A failure during binding initialization now rejects instead of hanging** (v1.26): `State.getBindingsReady()` used to stay pending forever if `buildBindings` / `hydrateBindings` threw — the symptom was a silent hang at `await`, not an error. It now rejects to the caller. The same reject is plumbed through `_connectedCallbackPromise`, so an `enable-ssr` block that fails makes `renderToString()` return an error and release its mutex instead of wedging.
- **An element that fails to initialize reports and rejects instead of hanging (v2.4)**. `connectedCallback` had one unguarded `await`, so a throw anywhere in initialization — a `$` declaration validator, any of the four state sources, the `enable-ssr` data merge, a DCC or `bind-component` setup error, or a second root `<wcs-state>` on the same root node — left `connectedCallbackPromise` pending forever: a page that never rendered, and a `renderToString()` / `mount()` that never returned. Now a **root** element reports once with `console.error` and rejects `connectedCallbackPromise` with the original error, unwrapped; `initializePromise` still resolves, so one element's mistake does not hold up the rest of the page's bindings. A duplicate root is refused alone (remove it — moving a healthy element is never a duplicate); `getBindingsReady(root)` rejects for a root whose state failed; `setInitialState()` on a failed element throws (replace the element). Detaching an element while its source is still loading is an interruption, not a failure. Configuration errors that leave the page working (`name=`, an unwired Light DOM `bind-component`) still **resolve** the promise, and a volume never rejects it.
- **A re-set re-renders the page (v2.5)**. `setInitialState(next)` on an **initialized** element replaces the whole state and re-applies every established binding to the new state *before it returns* — scalars, getters, row getters, `for` and `if` alike. Structural bindings go first, outer before inner, so a binding inside an `if` that the re-set closes is detached before it is read instead of reporting a bogus failure. A binding that cannot be read from the new state is reported as a **failed apply** (`console.error`, or the new state's `$errorCallback`) rather than left showing the old text, and the "report each path once" ledger behind `wcs/binding-path-missing` now belongs to **one state generation**, so a path the new state spells differently (`user.nmae`) is reported again; a `$watch` path the new state no longer declares is not. A re-set is **not a write**: no `$watch` handler, no `$scan` fold, no `$streams` restart and no `$updatedCallback` (the new declarations arm themselves). Lists are matched by **array identity** — pass a new array when a list's length changed; re-setting with the same array instance after pushing to or splicing it in place is not supported. A detached element re-applies when it reconnects, and a view-transition arbiter on the page receives the re-apply exactly as it receives an update. It still throws on a tree with grafted volumes or mounted components, on a loaded `mount=` volume element (§2, #268) and on an element that already failed to initialize. **On ≤2.4** reads moved to the new generation but no binding was applied again (#267), a volume re-set was a silent no-op (#268), and a path that vanished in the new generation was not diagnosed (#270).
- **$streams**: `$streams: { name: { args?, source, fold?, initial? } }` — source is `(args, signal) => AsyncIterable|ReadableStream|Promise<same>`, honoring AbortSignal is mandatory, `initial` is required when `fold` is specified. status/error: `$streamStatus.<name>` (`"idle"|"active"|"done"|"error"`) / `$streamError.<name>`. args are synchronous, cannot read wildcards, self-dependency forbidden. Infinite streams require a bounded fold. **Bridging callback APIs (EventSource / WebSocket / DOM events) — v1.22+ canonical form**: wrap in a `ReadableStream` (enqueue in `start`, release the resource in `cancel()`); the runtime cancels the reader on restart/dispose, so the AbortSignal contract is satisfied automatically. Hand-written async generators must watch `signal` themselves — a generator parked on `await` cannot be force-released from outside. **Observing a stream without rendering it (v1.27+)**: `$watch` its value path — or, for status-driven work, mirror `$streamStatus.<name>` through a non-`$` getter and watch that (§10 rule 2). A mapped `bind-component` child cannot declare `$streams` (same blanking as `$watch`). **Accumulating across runs (v2.4+)**: a stream's `fold` resets to `initial` on every restart — fold the stream's value in a `$scan` whose `from` is the stream name (§15).
- **Runtime errors carry self-fix guidance (v1.28+)**: a misspelled filter, an `eventToken.` name missing from `$eventTokens`, a bad `$watch` shape, or a DCC `$bindables` / `$commands` name that does not exist raises with a stable `[wcs/...]` code, a did-you-mean candidate (edit distance ≤ 2, the same criterion the lint CLI uses; DCC suggestions are split by kind, so a `$commands` typo only suggests methods), and a pointer to `npx @wcstack/lint` — attached only where lint detects the same case, so the hint never leads to a clean run. Existing error text is preserved; guidance is appended.
- **Unresolved wired paths warn at binding time (v1.31)**: a bound path that provably does not resolve (`user.nmae`) gets one `console.warn` with `wcs/binding-path-missing` + did-you-mean; a top-level typo throws with the same wording (it used to throw an internal `address.parentAddress is undefined`). The check **under-approximates**: `null`/`undefined` parents, rows of an empty list, sub-properties of a getter's return, mapped `bind-component` child scopes, and `$` namespaces all stay silent — **no warning proves nothing**; run lint for the exhaustive check.
- **One failing binding is confined to that binding (v1.31)**: if applying a binding throws, the rest of the batch, `$updatedCallback`, `$watch`, and `$streams` restarts all still run (before v1.31 one throw took the whole batch down, leaving a half-updated DOM and silently skipping every watch handler). The failure goes to `console.error` and devtools (`state:binding-apply-error`). The shared stance across every limit — propagation hops (32), watch chains (32), apply failures — is **report and continue; values and DOM are never rolled back**.
- **The binding grammar is machine-readable (v1.28+)** — tooling-facing, never needed in app code: `@wcstack/state/manifest` (and `dist/wcs-manifest.json`) now carries the complete vocabulary — modifiers (`prevent`/`stop`/`ro`, `init`/`sync`, the `on` event prefix), the `$1..$N` index params, and every binding type — and the new `@wcstack/state/parser` subpath exposes the canonical binding parser (DOM-free and pure; no position info; invalid syntax throws). This is the parser the lint CLI, the VS Code extension, and devtools all consume as of v1.29, so their diagnostics cannot drift from the runtime.
- **Aggregates over a list nothing renders are correct as of v2.3**: the list-diff baseline that `$getAll` reads and the dependency walk compares against moved from the render path to a **state-owned ledger**, committed at the end of each update batch. Before that it was written only when a `for` rendered the list, so a structural write to an unrendered list (a sort, an insert, a parent re-assignment) minted a fresh `ListIndex` generation while the child ledgers still pointed at the old one — the aggregate went permanently stale or threw `ListIndexes not found`. A recursive `$setAll` (§14) commits what it observed for the same reason; the fixed-arity `$setAll` still does not.
- **Configuration**: `bootstrapState({ locale, debug, enableMustache, bindAttributeName, tagNames: { state }, enableDirectionalInitialSync, enablePropagationContext, enableContractAnalyzer })`.
- **TypeScript**: Wrap with `defineState({...})` for `this` type completion (zero runtime cost — and as of v2.6 a bundled module that imports only `defineState` or the types tree-shakes to about 0.3 KB gzip; on ≤2.5 module-evaluation registrations kept the whole runtime, 26.7 KB, in that bundle). Keys containing `**` (§14) are typed `any` through a pattern index signature — ordinary dot paths keep their resolved types, and the VS Code extension's preamble declares the same signature so the editor, `wcs-tsc` and `tsc` agree. As of v2.4 the VS Code extension (1.15+) preamble and `wcs-tsc` declare `$scan?:` next to `$watch?:` — a `fold` is typed `this: void`, so a method-form fold that reads `this` is a type error — and type `$scan` outputs and `$streams` values read through `this` as `any` (a property you pre-declare keeps its own type).
- **SSR**: `<wcs-state enable-ssr>` + `renderToString()` from `@wcstack/server`. **v2.3**: the `<wcs-ssr>` hydration snapshot no longer evaluates the state object's **own enumerable getters** (`{ get count() { … } }` written in the object literal). They used to be evaluated with the raw object as `this`, so a path getter serialized as `null` and a getter calling `$getAll` threw and took the whole page's SSR down. Derived values are recomputed on the client from the same definition — code that read a getter's value out of the snapshot must read the data it derives from instead. **v2.5**: hydration now **applies** the bindings inside server-rendered blocks — the rows of a `for` and the contents of an `if` — once, as it already did for the bindings outside them. A getter records its dependencies only when it is evaluated, so before that a row-getter binding (`textContent: items.*.double`) kept the server-rendered text forever while an aggregate outside the rows updated normally. The text on screen does not change (the values come from the same state). Structural and event bindings, bindings on comment nodes, and index bindings (`$1` / `$2`, which depend on no state) are deliberately left as the server rendered them. **Still gaps**: the inner rows of a *nested* `for` (left unapplied rather than reported on every hydration), mustache text inside rows, a `for` inside an `if`, and `bind-component` children inside rows.

## 12. Component mechanisms — DCC vs `bind-component` (they are exclusive, v1.26)

Two mechanisms give a custom element its own state, and v1.26 made the choice **normative and mutually exclusive** — pick one per component; combining them is an error, and putting `<wcs-state bind-component>` inside a `data-wc-definition` host is a misconfiguration (DCC state belongs to the template and is loaded per instance).

| | DCC (`data-wc-definition`) | `bind-component` |
|---|---|---|
| How the element is defined | HTML only (Declarative Shadow DOM) | your own `class extends HTMLElement` |
| Where the state lives | inline `<script type="module">` in the template, loaded per instance | a property on the component instance (`this.state`) |
| `static wcBindable` | generated from `$bindables` / `$commands` | **none** — it is not a wc-bindable producer |
| Bind a value from the parent | `count: parentCount` (two-way, with change events) | `state.msg: user.name` (path mapping) |
| Invoke a method from the parent | `command.bumpBy: $command.bump` | not possible — expose it on the class and call it yourself |
| Spread (`...: obj`) | works | does not work (needs a `wcBindable` declaration) |
| Read/write from inside | `this.count` on the element | `this.state.msg` |

Rule of thumb: **no JavaScript class → DCC; already writing a class → `bind-component`.** That `bind-component` stays outside the wc-bindable protocol is deliberate — it wires by *path*, not by a declared property surface, and losing spread and command tokens is the consequence.

### DCC: `$bindables` and `$commands`

```javascript
export default {
  count: 0,
  bumpBy(step) { this.count += step; },
  $bindables: ["count"],     // observable properties (+ my-counter:count-changed events)
  $commands: ["bumpBy"],     // invocable commands  (v1.26+)
};
```

```html
<button data-wcs="onclick: fire">bump</button>
<my-counter data-wcs="command.bumpBy: $command.bump"></my-counter>
<!-- parent state: $commandTokens: ["bump"], fire() { this.$command.bump.emit(3); } -->
```

- Positional arguments pass through verbatim, so `emit(3)` calls the component state's `bumpBy(3)`.
- Every `commands` entry is declared `async: true` — a DCC method chains onto the inner `<wcs-state>`'s initialization, so the return value is a Promise even when the state method is synchronous.
- Both declarations are validated at definition time with the same strictness as `$commandTokens`. Errors: not an array; a non-string or empty entry; an entry starting with `$`; a **duplicate entry** (this used to break silently — one duplicate made the whole `wcBindable` declaration unreadable and the element quietly non-bindable); a name that does not exist on the state (own properties and the prototype chain are both searched; `$streams` names count as existing); a method listed in `$bindables`, or a value property listed in `$commands`.
- Other DCC state keys: `$connectedCallback` / `$disconnectedCallback` / `$updatedCallback` run per instance.

### `bind-component`: whole-object mount — `state: path` (the v2 default)

Instead of wiring property by property, mount a **whole subtree** of the host's state as the component's root; inside the component every path is then relative to the mount point:

```html
<!-- host: name inside the component IS user.name -->
<user-card data-wcs="state: user"></user-card>

<!-- in a loop, mount the row itself: inside, `name` is users.*.name,
     and the component's own `for: tags` runs over users.*.tags.* -->
<template data-wcs="for: users">
  <user-row data-wcs="state: ."></user-row>
</template>
```

- `state: user` mounts the component's root at tree path `user`. Reads, writes (`value: name`, `this.state.name = ...`), getters and `for:` all resolve against the tree; host-side `this.user = {...}` and `this["user.name"] = ...` both reach the component.
- **Partial mounts coexist**: `state: user; state.theme: theme` — longest prefix wins, so `theme.mode` inside reads the tree's `theme.mode`. Duplicate inner paths throw at build.
- **Own keys are private (rule R1)**: a data key the component declares itself (`state = { mode: "view" }`) belongs to the element and is never written to the tree. If it hides a key existing at the mount point, the runtime warns once (`wcs/mount-own-key-shadow`) — remove the default to read the tree, or rename to keep it private. Private-key updates **never reach `$updatedCallback`** (root or volume-relative) as of v2.1.0: their internal addresses carry a marker segment that is meaningless outside the scope and changes on every re-initialization. Inspect them in the devtools State pane's Overlays section instead.
- **Mounting an array as the root is not supported** (`state: rows` with `for` over it inside) — mount the row (`state: .`) or the object holding the array (`state: group` + `for: children` inside). Mounts are the only way to extend the tree in v2.
- The per-property form (`state.message: user.name`) keeps working — it is a partial mount on the same machinery. **v3.0+: an explicit partial mount wins over the component's own key** — a component that declares a default for a *mapped* key (`state = { message: "" }` next to `state.message: ...`) reads the host value and the default is unused. **On 2.x R1 kept that key private and hid the host value** (v1 let the host value win), with a one-time `wcs/mount-own-key-shadow` warning to which v2.6 appends `[wcs/v3-migration]` — removing the default is correct on both. Unmapped own keys stay private in every version.
- **`#ro` on a mount is honoured (v3.0+):** `state#ro: user` or `state.title#ro: doc.title` lets the component read but not write that entry — `element.state.title = …`, `this.title = …` in a method and `$setAll` / `$resolve` writes throw `[wcs/mount-readonly]`, and a two-way binding inside the component does not write back. The host still writes the path. On 2.x the modifier was accepted and ignored — the component's write reached the host's tree — and v2.6 warns on such a write (`wcs/v3-migration`). Write such values on the host, or drop `#ro`.
- **`$errorCallback` is root-only**; declared on a volume or a mounted component it is not run and, as of v2.6.0, is named by the warning that lists the root-only keys (≤2.5 ignored it silently).
- **One mount scope per component**: a second `<wcs-state bind-component>` on another property raises (the first scope's collected bindings would die silently).
- **No wildcard-terminal accessor over a mounted list**: `get "tags.*"()` on a mounted component raises — put the getter on the host tree, or over the component's own private array.
- `$getAll` / `$setAll` / `$resolve` / `$postUpdate` on `element.state` (and on `this` inside getters and methods) speak the component's own vocabulary: paths are translated onto the mount and the host row's indexes are prepended automatically.

**Exported getters — a component's derived values are readable at its mount point (v2.2+).** A read of a key the tree does **not** have is answered by the getter of the component mounted there; a key the tree *does* have wins (and warns once, `wcs/mount-export-shadowed`); **private data keys and methods are never visible** — R1 still holds, only accessors cross the boundary. With `<user-card data-wcs="state: user">` declaring `get display()`, the host binds `textContent: user.display`.

- **Row mounts export per row**: `$getAll("users.*.display")` on the host and `text: .display` inside the same `for` both read each row component's getter, and dependencies flow through — when `user.name` changes, everything that read `user.display` re-renders.
- **Only accessors whose exported path has the mount point's wildcard count are exported.** `get "children.*.label"()` works inside the component but is *not* exported — mount a component on each child row and give it `get label()`.
- **The parent evaluates before the child registers**, so a host expression's first read may see `undefined` and converges once the component mounts — write derived expressions defensively (`(x ?? 0)`). Binding-sourced missing-path warnings are deferred one macrotask for the same reason; with an autoloader an initial warning can still appear before the component registers even though the binding resolves.
- **Writing** to an exported key from outside runs the accessor's setter, or **throws** when it only has a getter — the tree never grows a key that would hide the getter. `in` does not see exported keys.
- Two components exporting the same key on one instance is a configuration error (`wcs/mount-export-ambiguous`), detected during candidate scans; a validated cache hit does not rescan, so a conflicting component added *after* the first resolution can escape detection.
- **Self-recursive components become expressible**: a `<tree-node>` that renders `<template data-wcs="for: children"><tree-node data-wcs="state: ."></tree-node></template>` inside itself can define `get total() { return this.value + this.$getAll("children.*.total").reduce((a, b) => a + (b ?? 0), 0); }` — each level's formula closes over one level and the ledger resolves the recursion. Paths cannot express recursion (their wildcard count is fixed), so the recursion lives in the DOM and the paths are its unrolled form. DevTools lists exported keys per mount record under `exports` in the Overlays section. Design: `docs/state-overlay-export-design.md`.

### `bind-component`: rendering the host's list inside the component

`<wcs-state bind-component="state">` goes inside the shadowRoot; the host writes `data-wcs="state.message: user.name"`. **In v2 the Light DOM form is written identically** — no `name`, no `@` references. An array can be bound across the boundary and iterated **inside** the component:

```html
<!-- host -->
<my-list data-wcs="state.items: rows"></my-list>
```
```javascript
// component shadow
this.shadowRoot.innerHTML = `
  <wcs-state bind-component="state"></wcs-state>
  <ul><template data-wcs="for: items">
    <li data-wcs="textContent: .name"></li>
  </template></ul>`;
```

The outer state stays the source of truth: replacing `rows` wholesale, or writing a single row field (`rows.0.name`), both reach the component's rows, and writing `items.*.name` back from inside reaches the host's `rows`. v1.26 lifted the single-boundary nesting restriction (a component inside the host's `for` running its own `for` over `state.items: groups.*.children` — which before v1.26 hung silently), and **v1.27 extended it to arbitrary depth and stacking**: components placed inside components stack scopes, the base list index composes across every boundary, and an intermediate component that only passes the array through — running no `for` of its own — still delivers a row-field write from the owning scope to the rows at the bottom. Loop indexes stay **scope-local** throughout: `$1`, event-handler indexes, `$updatedCallback` and `$getAll` all report the position within the component's own scope, so a component's author never has to know how deeply it is placed. Both READMEs now document this as "nesting and stacking scopes" (the old "not supported" note is gone as of v1.27).

In v2 a **mounted** component does not execute declaration surfaces: `$watch` / `$streams` / `$listKeys` / `$updatedCallback` are ignored with a one-time console warning pointing at the root state (v1 blanked them silently); `$errorCallback` joined that warning in v2.6 (ignored silently on ≤2.5). Declare them on the root or on a volume (§10 rule 7). A plain, unwired Shadow child owns its own tree and keeps them.

### `bind-component` in Light DOM (v2: identical to the Shadow form)

In v2 a Light DOM component is written exactly like the Shadow one — `<wcs-state bind-component="state"></wcs-state>` as a direct child, **no `name`, no `@` references**. Scope is decided by position in the DOM, not by a name, so the v1 rule "a component on every row of a `for` needs Shadow DOM" is gone: the same Light DOM component can sit on every row.

- **The host must wire it.** A plain, unwired Light DOM `bind-component` **cannot exist in v2** — an independent tree cannot share the parent's root — and it fails loudly with the fix: add `attachShadow`, or mount it from the host (`state: user` / `state.message: user.name`).
- **`State.getBindingsReady(root)` now covers mounted scopes** once the mount record resolves (the v1 "never covers a bind-component child" carve-out is gone). Await the component's own `<wcs-state>` when you specifically need its contents rendered.

### Your own `static wcBindable` element: what the two-way binding writes back

A third option is a hand-written class that declares `static wcBindable` itself (it then gets spread, command tokens and event tokens like an I/O node). The one rule that is easy to miss: when the element dispatches `properties[].event`, the value written to state is **`getter(event)`**, and with no `getter` the wc-bindable default is **`(e) => e.detail` — the whole `detail`, as-is**. The declared property is *not* read off the element at that moment (only the initial sync reads it). Dispatching `detail: { value: 7 }` without a `getter` therefore writes the object `{ value: 7 }` to state and the write-back becomes `NaN`. `@wcstack/lint` cannot see it (the payload shape is not static); **as of v2.2.0 the runtime warns once per element and property (`wcs/default-getter-mismatch`)** for the two shapes it can tell apart at the event — a `detail` that is `undefined` while the element property has a value (a plain `Event`, or a forgotten `detail`), and a `detail` object carrying a `<propName>` key while the property is not an object (the wrapper above). Any other mismatch still goes through unnoticed, the write is applied as-is either way, and occurrence properties (`semantics: "event"`) are exempt. Use one of the two conforming shapes:

```javascript
class YenInput extends HTMLElement {
  static wcBindable = {
    protocol: "wc-bindable", version: 1,
    properties: [
      { name: "value", event: "yen-input:value-changed" },                                   // (a) detail IS the value
      // { name: "value", event: "yen-input:value-changed", getter: (e) => e.detail.value }, // (b) detail is an object
      // { name: "value", event: "input",                  getter: (e) => e.target.value },  // (b) reusing a DOM event
    ],
    inputs: [{ name: "value" }],   // declare settable members in BOTH lists (§3 modifiers table, `#init=`)
  };
  #onInput() {
    this.dispatchEvent(new CustomEvent("yen-input:value-changed", { detail: this.value, bubbles: true }));
  }
}
```

Keep `element.value` and the extracted event value the same logical state (initial sync reads the property, later updates read the event). Do not expect the default to change: it is normative for every wc-bindable adapter, and DCC's `$bindables` reading `e.target[name]` is a producer-side `getter` choice, not a different default.

## 13. Testing the page headlessly (v1.33+)

A `<wcs-state>` page is plain DOM, so it tests under vitest + happy-dom with no browser and no test-only API. The one-import form is **`@wcstack/testing`** (`npm i -D @wcstack/testing @wcstack/state @wcstack/server vitest happy-dom` — state and server are peers):

```javascript
import { mount, settle, fire } from "@wcstack/testing";

const app = await mount(`
  <wcs-state json='{"count": 1}'></wcs-state>
  <p data-wcs="textContent: count"></p>
  <button data-wcs="onclick: up">+1</button>
`);                                                     // registers elements, waits for router + bindings
expect(app.root.querySelector("p").textContent).toBe("1");
await app.state().write((s) => { s.count = 42; });      // what a handler does
await settle();
fire(app.root.querySelector("button"), "click");        // what a user does
await settle();
app.unmount();
```

`mount(html, { root: "shadow", bootstrap: [async () => (await import("@wcstack/router")).bootstrapRouter()] })` scopes bindings to a fresh shadow root and registers additional packages. The bare recipe (no `@wcstack/testing`) is in the state README "Testing Your Page"; its two non-obvious lines: `URL.createObjectURL = undefined` in setup (Node cannot import `blob:` URLs, so this reroutes inline `<script type="module">` state through the `data:` loader — without it an inline state never finishes loading), and `await stateEl.connectedCallbackPromise` then `await getBindingsReady(document)` before asserting. Writes go through `stateEl.createStateAsync("writable", async (state) => {...})`.

- **A state that fails to initialize fails the test (v2.4)**: `connectedCallbackPromise` rejects with the original error, so `mount()`, `renderToString()` and `getBindingsReady(root)` reject with the cause — on ≤2.3 the same mistake hung until the runner's timeout (§11).
- **Snapshot**: `expect(await renderToString(html)).toMatchSnapshot()` — `renderToString` from `@wcstack/server`.
- **Bare Node (no vitest)**: `const restore = installGlobals(new Window({ url: "http://localhost/" }))` from `@wcstack/server`, then **dynamic-import `@wcstack/state` after it** (a static import at the top of the file registers elements happy-dom cannot construct), run the same steps, `restore()`.
- **Blind spots that still need one browser e2e** (Playwright): happy-dom replaces nodes on a late `customElements.define`, and its event timing differs from real browsers.

## 14. Recursive paths — `$recursion` and `**` (v2.3+)

A path burns its depth into the string: `nodes.*.children.*.total` is depth 2 and nothing stretches it to 3 when the tree grows a level. `$recursion` declares **where the shape repeats**, and `**` means "however deep this is", so one getter covers every depth.

```javascript
export default {
  $recursion: { "nodes.*": "children.*" },        // anchor → repeating sub-path

  nodes: [ { value: 1, selected: false, children: [ /* …same shape… */ ] } ],

  // One getter, every depth. `**` is bound to the depth being evaluated.
  get "nodes.**.total"() {
    return this["nodes.**.value"]
         + this.$getAll("nodes.**.children.*.total").reduce((a, b) => a + b, 0);  // indexes omitted = this depth
  },
  get treeTotal() {                                // `[]` = union of every depth
    return this.$getAll("nodes.**.value", []).reduce((a, b) => a + b, 0);
  },
  clearSelection() { this.$setAll("nodes.**.selected", [], false); },
};
```

**`**` is authoring notation only — it never reaches the engine.** Reading a concrete path (`nodes.*.children.*.total`) materializes the getter for *that* depth on demand, and everything downstream — `PathInfo`, the dependency graph, `$1`…`$n`, `$resolve`, the list diff — still sees an ordinary fixed-arity path.

### Declaring the recursion point

`$recursion` maps one **anchor** to the **repeating sub-path** one level down. Both name the *element* of a list: a fixed property chain ending in `.*`, never the list itself, and never carrying an index segment (`"nodes.0.items.*"` is refused — the recursion is over the shape of the tree, not one row).

```javascript
$recursion: { "nodes.*": "children.*" }     // nodes[i].children[j].children[k]…
$recursion: { "data.tree.*": "kids.*" }     // a deeper anchor is fine
$recursion: { "nodes.*": "nodes.*" }        // self-similar spelling is fine too
```

The declaration is what gives `**` a meaning at all — with no `$recursion`, `**` is not a path character (`wcs/recursion-unsupported`), so it can never quietly become a descendant search. **This version takes exactly one self-recursive anchor per state**, and it is **root-only**: a volume (`mount=`) declaring `$recursion` or a `**` getter is refused before grafting, and a mounted `bind-component` scope gets the `wcs/mount-dollar-declaration` notice like the other `$` surfaces.

### What `**` means where — bound vs union

Whether `**` is *bound* to one depth or *unions* every depth is decided by context, the same split `*` already has between "the current row" and "every row":

| Where `**` appears | What it means |
|---|---|
| A getter key — `get "nodes.**.total"()` | Bound to the depth being evaluated |
| A path read inside that getter — `this["nodes.**.value"]` | Bound to the same depth |
| `$getAll(path)`, indexes **omitted** | Bound to that depth; only the wildcards *after* `**` expand |
| `$getAll(path, [])`, **explicit** | **Union of every depth** — depth-first, pre-order, ascending index |
| `$getAll(path, [i, …])` | Refused: a prefix cannot say which depth it applies to (`wcs/recursion-getall-form`) |
| `$setAll(path, [], value)` | Broadcast to every depth, same order |
| `$resolve` / `$postUpdate` / `$trackDependency`, `$watch` and `$listKeys` keys, `data-wcs` markup, direct assignment | Refused (`wcs/recursion-unsupported`) |

The **bound** forms need a depth to bind to, so they resolve only **inside** a recursive getter, an ordinary row getter under the anchor, or an event handler bound to such a row — each carries a real `ListIndex` to read the depth from. Read `this["nodes.**.value"]` at the top level and you get `wcs/recursion-context`, not a guess. The depth comes from the **innermost evaluation frame only**: a plain getter that a recursive getter calls has no row of its own and gets `wcs/recursion-context` too — read `**` in the recursive getter and pass the value on. The **union** form needs no depth and can be read anywhere.

### Aggregating without counting grandchildren twice

This is the whole game, and the failure is a plausible wrong number rather than an error:

```javascript
get "nodes.**.total"() {                                        // ✅ omitted → direct children only
  return this["nodes.**.value"] + this.$getAll("nodes.**.children.*.total").reduce((a, b) => a + b, 0);
}
get "nodes.**.total"() {                                        // ❌ `[]` → every depth; the getter asks for itself
  return this["nodes.**.value"] + this.$getAll("nodes.**.children.*.total", []).reduce((a, b) => a + b, 0);
}                                                               //    in practice: wcs/getter-cycle
get treeTotalWrong() { return this.$getAll("nodes.**.total", []).reduce((a, b) => a + b, 0); }   // ❌ too big, silently
get treeTotal()      { return this.$getAll("nodes.**.value", []).reduce((a, b) => a + b, 0); }   // ✅ union raw values
get treeFromRoots()  { return this.$getAll("nodes.*.total",  []).reduce((a, b) => a + b, 0); }   // ✅ or sum the roots
```

**Union raw values, or sum the roots — never union something that already aggregates its own subtree.** Whether an aggregate double-counts is not decidable from the path string, so **no diagnostic catches this one**.

### Writing: broadcast only

`$setAll` takes `**` in exactly one form — `[]` plus a plain value — and returns the number of addresses written. Every other form is refused *before* the walk writes anything, so a rejected call leaves the tree untouched:

| Refused form | Why |
|---|---|
| a non-empty prefix | A prefix cannot say which depth it applies to (`wcs/recursion-setall-form`) |
| omitted indexes | The write API takes no evaluation context, so there is no depth to bind — `[]` is mandatory |
| a mapper function | `(current, ...indexes)` has a different arity at every depth |
| `{ spread: true }` | Handing a flat array to a tree needs the author to know the walk order |
| the structure itself — `nodes.**`, `.children`, `.children.*`, `.children.length`, `nodes.**.children.0`, and (multi-segment repeat) the object on the way to the list | Writing it invalidates the child addresses this very write already resolved (`wcs/recursion-structural-write`) |
| `nodes.**.total` or a path inside its value | A recursive getter has no setter (`wcs/recursion-readonly`) |

**The read-only rule does not depend on spelling `**`.** A recursive getter's concrete expansions — `nodes.*.total`, `nodes.*.children.*.total`, `nodes.1.total` — are refused at the write entry too, whether the write is a fixed-arity `$setAll`, a `$resolve(path, indexes, value)` or a direct assignment, and whether or not that depth has been materialized. Before this check an unmaterialized expansion looked like a missing key, and the write landed on the node object, pinning that value as the getter's cached result.

### The input has to be a tree

The walk refuses reaching the **same array instance** twice: from an ancestor it is `wcs/recursion-cycle`, otherwise two nodes share one child list (`wcs/recursion-shared-list`). Give every node its own `children` array — sharing an *empty* one is fine (no rows to alias). The ceiling is **128 wildcard levels** (`wcs/recursion-depth-exceeded`, naming the anchor, depth, path and limit); it trips before the getter stack's own 128-frame limit (`wcs/getter-depth-exceeded`), so a deep tree is reported as deep instead of accused of a cycle. Nothing is truncated — a partial aggregate would be a wrong number reported as a right one.

**Replacing row objects while keeping their `children` arrays works as of v2.4 (#256).** After `this.nodes = this.nodes.map(n => ({ ...n }))` the child list keeps its existing row objects and only the retired parent row they hung under is swapped for the live one, so the next leaf update dirties the row that is on screen — and anything keyed by row identity (a `bind-component` child scope's rendered rows, an open `<details>`, focus) survives. A plain nested `for` still rebuilds the child rows under a replaced parent row. **On 2.3** that row's `nodes.*.total` froze after the next leaf update while the leaf, the deeper totals and every `[]` union stayed right, so nothing complained — there, write rows in place through paths (`$resolve` / `$setAll`), keep the row objects (`[...this.nodes]`), or deep-clone the subtree; hand-written multi-level getters had the same limit. **Sharing one `children` array between rows** is a separate matter (under `$recursion` it is refused, above): an array has one set of rows, so a row getter that reads its parent is evaluated for the row that first expanded the array, and when that owner leaves the list the rows follow one surviving row (v2.4) while any other sharer freezes. Give every node its own array when a child getter reads upward.

### Rendering the tree

`**` cannot appear in markup and there is no recursive `<template>`. A tree is drawn by a **self-referential component** — one custom element whose shadow mounts itself for each child, so only one level of path is ever used inside a scope (`node.children.*`) and `node.total` resolves through the mount onto the root state's recursive getter.

```html
<template data-wcs="for: nodes"><tree-node data-wcs="state: ."></tree-node></template>
```
```javascript
const TEMPLATE = `
  <wcs-state bind-component="state"></wcs-state>
  <span data-wcs="textContent: label"></span><span data-wcs="textContent: total"></span>
  <button data-wcs="onclick: addChild">+ child</button>
  <template data-wcs="for: children"><tree-node data-wcs="state: ."></tree-node></template>`;

customElements.define("tree-node", class extends HTMLElement {
  state = {                     // ← methods only: `label` / `value` / `children` come from the mount
    addChild() { this.children = [...this.children, { label: "new", value: 5, children: [] }]; },
  };
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  connectedCallback() {                         // ← build the shadow HERE, not in the constructor
    if (this.shadowRoot.childNodes.length === 0) this.shadowRoot.innerHTML = TEMPLATE;
  }
});
```

Two traps, both hit for real and both quiet:

- **The component's `state` must not declare the keys it is mounted over.** Methods and unrelated private keys are fine; a `node` / `children` of its own is not — an own key is private (rule R1, §12), so it hides the mount and the child renders its own default and never descends. The runtime names this one: `wcs/mount-own-key-shadow`.
- **Build the shadow in `connectedCallback`, not the constructor.** Assigning `innerHTML` in the constructor upgrades the elements inside `<template>` on implementations that do not keep template content inert, and a self-referential element then recurses forever in its own constructor. Real browsers survive it, which makes it environment-dependent rather than an honest crash.

Fixed depths need none of this: expanded paths are ordinary paths, so nested `for` templates bind `nodes.*.total` like anything else. Working demo: `packages/state/examples/recursive-tree/`; design: `docs/state-recursive-path-design.md`.

### Not in this version (each is a diagnostic, never a reinterpretation)

More than one anchor, mutual recursion, a wildcard mid-anchor, a second `**` in one path; recursive **setters**; a `**` getter whose suffix names the structure (`get "nodes.**.children"()`, `.children.*`, `.children.length`); two `**` getters expanding to the same concrete path; a concrete getter with the same name as an expansion (`get "nodes.*.children.*.total"()`); `get "nodes.**"` (that names the node itself); a recursive `<template>`, a `$depth` variable, and a public `maxDepth` option.

**Diagnostics.** `wcs-validate` and the VS Code extension (1.14+) report every statically decidable form under the same codes and stay silent where the declaration cannot be read statically (an identifier reference, a spread, a computed key, a `class` state). **Runtime-only** — the linter does not emit them: `wcs/recursion-context`, `wcs/recursion-shared-list`, `wcs/recursion-cycle`, `wcs/recursion-depth-exceeded`, plus `wcs/getter-depth-exceeded` and `wcs/index-param-range`.

## 15. Accumulation over time — `$scan` (v2.4+)

A getter derives from *current* values; a `$streams` `fold` accumulates *within one run* and resets to `initial` on every restart; `$watch` owns no value. **`$scan` declares the value that has to outlive all of those** — an accumulation with an owner, a firing unit and a reset condition.

```javascript
export default {
  page: 1,
  host: "a.example",
  $eventTokens: ["message"],
  $streams: { pageResult: { args: (s) => s.page, source: loadPage } },   // loadPage: io-node-catalog.md intersect-scroll recipe
  $scan: {
    feed: {                                    // from: fold each landing of a state path
      from: "pageResult",
      initial: { items: [], pages: [] },
      fold: (feed, chunk) =>
        chunk?.kind === "success" && !feed.pages.includes(chunk.page)
          ? { items: feed.items.concat(chunk.items), pages: [...feed.pages, chunk.page] }
          : feed,                              // returning acc itself writes nothing
    },
    log: {                                     // on: fold each event of a declared token
      on: "message",
      initial: [],
      fold: (log, event) => [...log.slice(-49), event.detail],   // bounded
      resetOn: ["host"],                       // back to [] whenever host is written
    },
  },
};
```
```html
<template data-wcs="for: feed.items"><li data-wcs="textContent: .name"></li></template>
<wcs-sse url="/events" data-wcs="eventToken.message: message"></wcs-sse>
```

### Declaration

| Field | Contract |
|---|---|
| `from` | A state path; a wildcard folds per row. Exactly one of `from` / `on`. No leading `$`, no `@`, no empty segment; **not a getter or anything under one** (an expansion of a `$recursion` `**` getter, `nodes.*.total`, counts as one), not a setter without a getter, not the entry's own output |
| `on` | An event-token name declared in `$eventTokens` |
| `initial` | **Required** (an explicit `undefined` is fine) — the seed, and what `resetOn` returns to. Plain arrays and plain objects are **copied** each time they are placed, so writing a child path of the output never edits the declaration; class instances, frozen values, `Map` / `Set` / `Date`, functions and the like are placed by reference |
| `fold` | **Required.** `from`: `(acc, cur, prev, ...indexes)`; `on`: `(acc, event, ...indexes)` |
| `resetOn` | Optional `string[]` of plain paths — no `*`, not a getter, not the entry's own `from` or under it, not a scan output. Writing one returns the output to `initial` |

The output name is a flat key (no `.` / `*`, no leading `$`, not an `Object.prototype` name) and must not collide with a getter, a setter, a method or a `$streams` entry. The runtime materializes it from `initial` when the state lacks it and owns it like a `$streams` value; bind it like any path. It survives stream restarts, disconnect / reconnect and a re-set of the same object; a re-set with a new declaration rebuilds the scans.

### Firing

| | `from` (a path) | `on` (an event token) |
|---|---|---|
| Unit | One fold per address that landed in an update batch; writes in one job coalesce (`cur` = settled value, `prev` = value at batch start) | One fold per event — two events in one task fold twice |
| When | End of the drain, **before `$watch`** | Synchronously inside the event, **before that token's `$on` handlers** |
| Output visible | From the next batch; a `$watch` handler in the same drain already reads the folded output, and a value it writes there stays | Immediately — the same event's `$on` handlers see it |

- **Mechanism order**: `$updatedCallback` → `$scan` → `$watch` → `$streams` restart (with a `<wcs-view-transition>` accepting `state`: `$scan` → `$watch` → `$streams` restart → `$updatedCallback`).
- **A wildcard `from` has the `$watch` prerequisite**: rows land only when the list is `for`-rendered or declared in `$listKeys` (§10 rule 4). Rows chain `acc` in ascending index order, the output is written once, and landings are narrowed to one per position as the list stands at the drain.
- **An equal primitive write never lands** (the same-value guard), and a bound element output as `from` also folds the binding's initial sync — take element occurrences through `on`.
- A whole-parent write (`this.user = {…}`) lands a child `from` such as `user.name` with `prev === undefined`. `prev` follows `$watch`'s ledger (§10): also `undefined` for a reference value, for `$postUpdate`, and for a write made inside a `$watch` handler or by another scan.
- A `from` that is another scan's output folds it once per landing, whatever the declaration order.

### With `$streams`

- **Restart wins**: a chunk that lands in the same batch as its stream's restart belongs to the aborted run and is not folded.
- **Never derive the stream's `args` from its own scan output** — directly, through a getter, or through another scan that folds it. That would restart the stream on its own result, so the runtime raises `wcs/scan-feedback-loop` on every start and restart. At the first start it is **not** normalized: the stream stays `idle`, nothing reaches `$streamError.<name>`, and `connectedCallbackPromise` never settles (a dependency-driven restart lands it in `$streamError.<name>`). Keep the cursor a plain property and advance it from an event:

```javascript
get page() { return Math.floor(this.feed.items.length / this.pageSize) + 1; },   // ❌ feedback loop
page: 1,                                                                          // ✅ a plain property…
$on: { sentinelChanged: (state) => { state.page = Math.floor(state.feed.items.length / state.pageSize) + 1; } },  // …advanced by an event
```

### The fold contract

- **Synchronous, and returns a new value** — mutating `acc` in place defeats the same-value guard and the list diff. **Returning `acc` itself writes nothing** (a progress chunk passes through).
- **No `this`** — carry what the fold needs on the source value (the intersect-scroll demo puts `pageSize` on the chunk).
- **A throw, a returned Promise, or an unreadable value** is reported to the console and DevTools (`state:watch-error`, path `$scan.<output>`, `phase` `"evaluate"` / `"fold"` / `"write"`) and writes nothing; one unreadable row of a wildcard `from` is skipped alone. The other scans, `$watch`, stream restarts and the same token's `$on` still run.
- **Once per landing, not once per page.** A Retry after a page is `done`, or re-attaching the state element (the stream restarts on the current page), lands the same page again — keep an idempotency key in the accumulator.
- **Never fold a getter** — it re-evaluates whenever an input changes, so a fold would count re-evaluations. Refused at declaration (`wcs/scan-source-computed`); a `from` that becomes a getter later (a volume registering an accessor) reports once and stops folding.
- **Keep it bounded** — there is no backpressure: `[...log.slice(-99), x]` or a count, never `[...log, x]` over an infinite source.

### `resetOn`

- A `from` scan resets at the end of the drain and **skips that batch's fold** (reset wins). An `on` scan sees the reset from the write on: a later event folds into `initial`.
- It fires on addresses, not values. **An object path resets only when that object itself is written** (`this.filter = {…}`), never on a child write (`this["filter.text"] = "b"`) — list the leaf paths or bump a nonce. A write while the state element is disconnected does not reset.
- An **ancestor** of `from` is allowed (`from: "items.*.qty"` with `resetOn: ["items"]` starts over when the list is replaced; the new rows are not folded). A path **under** `from` raises — the reset would win every time.
- A reset that finds the output already equal to `initial` (plain data compared by contents) writes nothing, so a `$watch` on the output does not fire for it — watch the `resetOn` path (a nonce) to react to every reset. Only the output resets; a cooperating cursor (`page`) is yours to rewind.
- To clear from a user action: `clearNonce: 0, clearLog() { this.clearNonce = this.clearNonce + 1; }` with `resetOn: ["clearNonce"]`.

### Scope, lifecycle and one `$watch` subtlety

- **Root-only**: a volume (`mount=`) refuses `$scan` before grafting; a mounted `bind-component` scope ignores it with the one-time `wcs/mount-dollar-declaration` notice.
- **Disconnected**: `from` / `resetOn` do not fire and occurrences are not folded; the output is kept, and both resume on reconnect (`on` subscriptions survive a disconnect, as `$on` does as of v2.4). **SSR**: the declaration is checked and the output materialized; `from` does not fold.
- A `$watch` on the output normally gets `prev === undefined`, because the scan's write lands in the next batch. When the `from` source is written again before that landing drains — by a `$watch` handler in the same drain, say — the two share a batch: the watch gets the landed value in `prev`, sees `cur` one step ahead, and can fire once more with the same value. Make such a handler tolerate a repeated value.

| You want to | Use |
|---|---|
| compute from current values | a getter (`$getAll(...).reduce`, a wildcard getter) |
| fold within one run, where a restart may discard it | `$streams` `fold` |
| accumulate across runs and events | `$scan` |
| react with a side effect (emit a command, write outside) | `$watch` / `$on` |

**Diagnostics.** `wcs-validate` and the VS Code extension (1.15+) check the declaration under the runtime's codes: `wcs/scan-declaration-invalid` and `wcs/scan-source-computed` (errors; `$scan` in a mounted component is a warning), `wcs/scan-path-missing` (warning — a `from` / `resetOn` typo silently never folds or resets; the runtime also warns once at declaration), and `**` in `from` / `resetOn` as `wcs/recursion-unsupported`. Scan outputs materialize as path candidates from `initial`, so `for: feed.items` validates. **Runtime-only**: `wcs/scan-feedback-loop` (it needs the graph of what `args` reads). Working demo: `examples/state-intersect-scroll/` (its feed); reference: `packages/state/docs/scan.md`; design: `docs/state-scan-design.md`.

## 16. 2.x → 3.0 — what 3.0 rejects or reads differently (announced by v2.6 as `wcs/v3-migration`)

**3.0 ships without a compatibility layer.** The syntax rows below throw in 3.0 when the binding is set up; the value and API rows mean something else there. 2.6, the last 2.x minor, names every one of them while still running it the 2.x way: each is printed once per form and site as a `console.warn`, saying what 3.0 does and what to write now. Upgrading an existing page: move to 2.6.1, clear the warnings, then move to 3.0 (the wcstack repo's `docs/migration-v3.md` walks through it).

```
[@wcstack/state] [wcs/v3-migration] "value#ro#wo": 3.0 rejects a second "#". Write "value#ro,wo". See "Preparing for 3.0" in the @wcstack/state README.
```

**Generate the "write now" column in new code** — every entry is correct on 2.x and 3.0 alike, and several of the 2.x behaviours are silent bugs in their own right (marked ⚠):

| Form | 2.x | 3.0 | Write now |
|---|---|---|---|
| A second `#` (`onclick#prevent#stop:`) | Keeps the first modifier list ⚠ | `[wcs/binding-syntax]` | `onclick#prevent,stop:` |
| A value after `else:` | Ignored | `[wcs/binding-syntax]` | `else:` |
| Modifiers or filters on the keyword `for` / `if` / `elseif` / `else` / `...` (`if#ro:`, `for\|f:`) — right-side filters (`if: count\|gt(0)`) are unaffected | A plain property binding ⚠ | `[wcs/binding-syntax]` | The bare keyword |
| `radio#ro:` / `checkbox#ro:` | Binds a property named `radio` / `checkbox` — no effect ⚠ | A radio / checkbox binding that honours the modifiers | Check the binding does what you meant |
| An unterminated quote in filter arguments | Closed silently | `[wcs/binding-syntax]` | Close the quote |
| More filter arguments than the filter takes | The rest ignored ⚠ | `[wcs/filter-arity]` | Remove them |
| An empty filter (`x\|`, `x\|\|y`) — not announced, only the code changes | `[wcs/filter-unknown]` | `[wcs/binding-syntax]` | Remove it |
| Unquoted `true` / `false` / `null` in `eq` / `ne` | Compared with the *string* — `eq(true)` never matches a boolean ⚠ | Compared with the typed value | Bind the boolean directly; `eq('true')` only for real text (§7) |
| Unquoted `true` / `false` / `null` in `defaults` | Falls back to the text (`"null"`) ⚠ | Falls back to the typed value | `defaults('null')` to keep the text |
| An unquoted number in `defaults` (`defaults(0)`) — not announced | Falls back to the text `"0"` | Falls back to the number `0` (displays the same) | `defaults('0')` when a later filter or comparison needs the text |
| `0n` through `truthy` / `falsy` / `defaults` | Truthy | Falsy (JavaScript truthiness) | — |
| `undefined` into `textContent` / `innerText` / `innerHTML` | Keeps the previous text — in a reused `for` row, **the previous row's** ⚠ | Empties it | Return `""` or `null` for "no value" |
| `undefined` / `null` into `attr.*` | Writes the text `"undefined"` / `"null"` ⚠ | Removes the attribute | Do not rely on either; bind a real value |
| `undefined` into `style.*` | Keeps the previous value | Clears it | — |
| `$resolve(path, indexes, undefined)` | Reads | Writes `undefined` (the argument count decides) | `$resolve(path, indexes)` to read |
| `$resolve(path, indexes, value)` / `$setAll` on a readonly proxy (`createState("readonly", …)`) | Writes | Throws `This state is readonly.` | Write from `createState("writable", …)` |
| A component writing through a `#ro` mount (`state#ro: user`) | Writes the host's tree | `[wcs/mount-readonly]` | Write on the host, or drop `#ro` (§12) |
| An own default shadowed by a partial mount (`state.name: user.name` while the component declares `name`) | The default wins, with a warning | The explicit mount wins | Remove the default (§12) |

One change arrived early (2.6.0) instead of being announced: `$errorCallback` on a volume or a mounted component, which was ignored silently, is named by the warning that lists the root-only keys (§2, §11). It still runs only on the root state.

- **A clean console proves nothing (2.6).** A value warning (`undefined` into a text, `0n`, a readonly write) fires only when that value actually arrives, so paths your tests did not reach stay silent. The syntax rows are checked when a binding is first parsed.
- **Lint**: `npx @wcstack/lint` 2.6 reports the syntax rows statically as `wcs/v3-migration` at **info** severity — `--strict` does not fail on them, so a minor upgrade never breaks a CI gate. Extra filter arguments stay under the existing `wcs/filter-arity` (error). **The 3.0 lint reports the same syntax rows as `wcs/binding-syntax` (error)** — the code the runtime throws — and `wcs/v3-migration` is gone. The value and API rows (empty values, readonly writes, `#ro` mounts, `0n`) are runtime-only on both. The VS Code extension shares the check from its release after 1.15.0.

## Pitfall Checklist

1. The runtime does not observe `this.user.name = "Bob"` — always use `this["user.name"] = "Bob"`; lint reports `wcs/nested-assign`.
2. The runtime does not observe destructive array methods or direct index assignment — reassign a new array, use `this["items.0"] = value`, or use `this.items = this.items.with(0, value)`; lint reports `wcs/array-mutation` / `wcs/array-index-assign`.
3. `onclick:` cannot take arguments — use zero-argument wrapper methods.
4. The `for:` path must be an array — while the fetch `value` is null, interpose a `?? []` derived getter.
5. Bare names (`fetchUsers`) on the command binding right side are not allowed — `$command.fetchUsers` is required.
6. The `eventToken.` key is the wcBindable **property name**, not the raw DOM event name.
7. `wcs-fetch:response` (the value event) also fires on HTTP/network errors — check the status in `$on`.
8. Do not seed convenient initial values into output-only wcBindable members (the element's real initial value replaces them).
9. `$streams` sources must not ignore AbortSignal (ReadableStream sources satisfy this automatically via `cancel()`; only hand-written async iterables must watch `signal`).
10. Do not forget the trailing colon on `else:`.
11. Duplicate entries in `$commandTokens`/`$eventTokens` and undeclared keys in `$on` are initialization-time errors. Accessing an undeclared token (`this.$command.typo`) yields `undefined`.
12. There is no custom filter registration API — do transformations the 46 built-ins cannot express in a getter.
13. The only valid separator for multiple bindings in `data-wcs` is `;`.
14. A property binding is same-value guarded: an `Object.is`-equal primitive write is skipped entirely (no dependency walk, no DOM apply, no `$updatedCallback`). Take repetition from the event-token surface — or from an I/O-node property declared `semantics: "event"`, which is exempt as of v1.24.
15. `$on` handlers are never awaited. An async handler's rejection is reported via `console.error` (v1.24+), not propagated — do not sequence work on it.
16. Under a strict CSP the default state form (inner `<script type="module">`) is blocked — it is imported through a `blob:` URL and the page nonce does not carry over. Move the state to `src="./state.js"`, or open `script-src blob:` knowingly.
17. `$updatedCallback` reports only paths whose live DOM bindings were applied. It is not a headless watcher; an unbound write never reaches it — declare `$watch` (v1.27+, §10) for that.
18. A `$listKeys` key is the **list path itself** — `"items"` or the nested `"items.*.children"`, never a path ending in `*` (`"items.*"` is rejected). Rows must be plain objects with keys that exist and are unique; a duplicate/missing key or a class instance raises rather than degrading. Remember `this.items !== theArrayYouAssigned` afterwards.
19. DCC and `bind-component` are mutually exclusive per component; a duplicate entry in `$bindables` / `$commands` is an error (it used to silently disable the element's binding surface).
20. `State.getBindingsReady()` rejects on a binding-init failure as of v1.26 — if you `await` it, handle the rejection. (Before v1.26 the same failure hung forever, so an old workaround built around a timeout can be deleted.) As of v2 it **does** cover mounted scopes once the mount record resolves; still await the component's own `<wcs-state>` when its contents specifically matter. As of v2.4 it also rejects for a root whose `<wcs-state>` failed to initialize.
21. `$watch` keys are scope-relative paths only: no `@` (a parse error in v2), no `$`-prefix. To react to `$streamStatus.<name>`, mirror it through a non-`$` getter and watch that (the watched getter turns eager, so it evaluates even unrendered).
22. A headless wildcard row watch fires **zero** times without `$listKeys` or a rendered `for`; and without `$listKeys`, a whole-array assignment fires every row with `prev === undefined`. `prev` is scalar-only in all cases.
23. `$watch` handler exceptions are isolated (console + devtools, remaining watches still run), write chains are cut at 32 links, and SSR never runs watches. A **mounted** `bind-component` scope does not execute declaration surfaces at all — `$watch` / `$streams` are ignored with a one-time warning pointing at the root state.
24. A structural binding (`for` / `if` / `elseif` / `else`) must be alone in its `data-wcs` — sharing the attribute with any other binding raises `[wcs/template-syntax]` and takes the page down (lint-checked as of v1.29).
25. A `[wcs/...]`-prefixed runtime error means the lint CLI reproduces the same finding with a source range — run `npx @wcstack/lint` and fix every instance, not just the throwing one.
26. Getters read only through `this` — an untracked read (`Date.now()`, the DOM, a module variable) keeps its first value forever. State the input as state, or use `$trackDependency` / `$postUpdate`.
27. `$resolve` requires the index count to match the path's `*` count exactly; `$getAll` treats it as an upper bound. Surplus indexes throw `wcs/index-arity` as of v1.31 — on older versions they were silently dropped, returning a plausible wrong value.
28. The non-reactive assignment family (`wcs/nested-assign` / `wcs/array-mutation` / `wcs/array-index-assign`) is **error** severity since v1.31 — `wcs-validate` exits `1` on it, so a CI gate that passed on 1.30 can fail after upgrading the linter. That is the intended behavior; fix the assignments, not the gate.
29. The filters' default locale is `<html lang>` as of v1.32 (was `'en'`) — a page that omits `lang` still formats in English, and changing `config.locale` after render updates nothing. Set `<html lang>` in the markup.
30. `$setAll` broadcasts arrays by default — replacing each row with successive entries needs `{ spread: true }` (length mismatch throws). `undefined` from a mapper means "skip this row", never "write undefined". And omitted `$getAll` indexes default to the **loop context** as of v1.32 — inside a `for`-scoped getter that narrows to the current row; pass `[]` explicitly for "every match".
31. A `stateSchema` in the nearest `wcstack.manifest.json` (generated by `wcs-schema emit src/state.ts`, or hand-written) turns a missing path into `wcs/path-nonexistent` (**error**) and `for:` on a non-array into `wcs/path-type-mismatch` — the discovery walks up from the HTML file, so a manifest in a parent directory applies to every page below it, and an explicit manifest argument replaces discovery for the whole run. **v2 carries a single `stateSchema` (`schemaVersion: 2`)**, matching the one tree per root; a volume contributes a subtree via `--mount=<path>`. Paths under a bare `{}` (a `Date`, `Map`, `Record<string, T>`, or the depth cut-off) stay silent; methods, getters and `$listKeys` from the inline script still count as existing, and so do row fields the analyzer reads from `concat({ … })` / `toSpliced` / `with` / spread-array assignments (a list that starts `[]` rarely needs a schema just to name its row fields). The manifest is derived from the type: gate CI with `wcs-schema check` and regenerate with `emit --merge` after changing the state type.
32. Named state is **removed in v2**: `name=` fails fast at runtime and `@` anywhere in a path is a parse error, both printing the replacement; lint reports `wcs/named-state-deprecated` as an **error**. One tree per rootNode — split modules with `mount=` (§2), hand a component a subtree with `state: path` (§12). The v1 Light DOM exemption is gone with it.
33. Mount rules (`state: path`): an array cannot be the mount root — mount the row (`state: .`) or the object holding it. An own key that shadows a mount-point key stays **private and hides the tree value** (rule R1), warning once as `wcs/mount-own-key-shadow`; a default declared for a *mapped* key (`state = { message: "" }` next to `state.message: ...`) must be dropped or the host value never arrives. One `<wcs-state bind-component>` per component; a wildcard-terminal accessor (`get "tags.*"()`) over a mounted list raises. As of v2.2 the component's **getters are exported** at the mount point (`user.display` on the host reads the component's `get display()`; row mounts per row) — private data keys and methods still are not; a tree key of the same name wins and warns `wcs/mount-export-shadowed`; the first host read may be `undefined` until the component registers, so write `(x ?? 0)`.
34. `wcs-validate --strict` exits `1` on **warnings** too (severities are unchanged; only the exit threshold moves). It is the way to make a path typo (`wcs/binding-path-missing`, a warning) fail CI — but run it only once every `<wcs-state src>` resolves relative to its HTML, because an unresolvable external state leaves warnings that now fail the build. `--errors-only --strict` keeps the output quiet while still failing.
35. The **root `<wcs-state>` is required** — a page with only `mount=` volumes is a loud error. `mount` must be a static dotted path; `*` / `$` / `#` / `@` / empty segments raise and lint as `wcs/mount-path-invalid`. Mounting onto a slot the root already owns throws, as does writing a mount point's parent wholesale from the root.
36. `setInitialState()` cannot re-set a tree that already has volumes or mounts on it, and cannot re-set a `mount=` volume element itself (v2.5 throws; on ≤2.4 it was a silent no-op for the page, #268) — a wholesale replacement would discard grafted data, accessors and the merged declaration surfaces. Write the individual paths, on the root state. Re-setting a plain initialized tree *is* supported and re-renders the page as of v2.5 (§11).
37. A volume (`<wcs-state mount>`) hosts getters, `$watch`, `$listKeys`, `$updatedCallback` and the connected/disconnected callbacks **relative to its mount path** — but **`$streams` raises** there, `$errorCallback` (v2.2) is root-only (a volume declaring it is ignored — with a warning as of v2.6), and `$commandTokens` / `$eventTokens` / `$on` are root-only (a mounted declaration warns and does nothing). These are the only migrations that are not a plain rename.
38. On your own `static wcBindable` element, a two-way binding writes **`getter(event)`** to state, defaulting to the whole **`e.detail`** — never `element[propName]`. Dispatch the value itself as `detail`, or declare `getter: (e) => e.detail.value` / `(e) => e.target.value` (§12). A wrapper-object `detail` without a `getter` stores the object and the write-back becomes `NaN`; lint cannot see it, and the runtime warns once only for the two detectable shapes (`wcs/default-getter-mismatch`, v2.2+).
39. A binding that throws while applying (a getter or filter threw, a structural directive failed) is **isolated and reported to `console.error`** — that node stays stale, nothing else is rolled back, and the page shows no message. Declare `$errorCallback(error, { path, bindingType, node })` on the **root** state (v2.2+, §11) to route the report in-page (`this.loadError = …` + a `textContent:` bind). It does not cover `$watch` handlers or `$connectedCallback` / `$updatedCallback` exceptions, and a volume or mounted component declaring it is ignored (named by a warning as of v2.6, silently before).
40. `this.form.name` inside a getter tracks **`form` only** — the getter never re-runs when `form.name` is edited through a binding. Read `this["form.name"]`; `wcs-validate` / VS Code report `wcs/getter-untracked-read` (v2.2) when the document writes that nested path. Reads inside a setter are never tracked, and the same-value guard skips primitives only (§6).
41. Under `require-trusted-types-for 'script'` the `html:` / `innerHTML:` bindings and `<wcs-fetch target>` need a sanitizing policy you install (v2.2 reports once with the fix; ≤2.1 failed silently), and `<wcs-layout>` / `<wcs-worker>` need `trusted-types wcstack` in the CSP (§2).
42. `**` (v2.3, §14) is **authoring notation for the state definition only**. It is refused in `data-wcs` and mustache, in `$watch` / `$listKeys` keys, in `$resolve` / `$postUpdate` / `$trackDependency`, and in any assignment (`wcs/recursion-unsupported`) — and without a `$recursion` declaration it is not a path character at all. Draw the tree with a self-referential component, not with a recursive template.
43. **Unioning an aggregate double-counts, and nothing catches it.** `$getAll("nodes.**.total", [])` adds every node's total, each of which already folds its own subtree — a plausible number that is too big. Union raw values (`nodes.**.value`) or sum the roots (`nodes.*.total`). Inside the recursive getter the same mistake shows up as `wcs/getter-cycle` instead, because the getter ends up asking for itself.
44. A **bound** `**` (`this["nodes.**.value"]`, an index-omitted `$getAll`) reads its depth from the innermost evaluation frame only. From the top level, or from a plain getter that a recursive getter calls, it is `wcs/recursion-context` — read it in the recursive getter and pass the value on, or pass `[]` to union every depth.
45. A recursive `$setAll` takes **`[]` plus a plain value** and nothing else — no prefix, no omitted indexes, no mapper, no `{ spread: true }` — and may not target the structure (a node, a child list, its `length`) or a recursive getter. A recursive getter is read-only **at every spelling**: `nodes.*.children.*.total` and `nodes.1.total` are refused too, materialized or not (`wcs/recursion-readonly`).
46. The recursion input must be a **tree**: reaching the same array instance twice is `wcs/recursion-shared-list` / `wcs/recursion-cycle`, and 128 wildcard levels is the ceiling. On ≤2.3, replacing row objects while keeping their `children` arrays left that row's aggregate stale with no warning (#256) — fixed in v2.4; on 2.3 write rows in place, keep the row objects, or deep-clone the subtree.
47. A self-referential component must not declare its own key for what the mount provides (it would hide the mount — `wcs/mount-own-key-shadow`), and must build its shadow in `connectedCallback`, not the constructor (a constructor `innerHTML` recurses forever where `<template>` content is not inert).
48. An accumulation that must outlive a `$streams` restart belongs in **`$scan`** (v2.4, §15) — a stream's `fold` resets to `initial` on every restart, and `$watch` owns no value. The fold is synchronous, gets no `this`, and returning `acc` itself writes nothing; a getter is never a source (`wcs/scan-source-computed`); `$scan` is root-only.
49. A scan folds **once per landing, not once per page**: a Retry after `done`, or a re-attached state element, lands the same page again. Keep an idempotency key in the accumulator.
50. Deriving a stream's `args` from its own scan output — directly, through a getter, or through another scan — raises `wcs/scan-feedback-loop`, and at first start that leaves the stream `idle` and `connectedCallbackPromise` unsettled. Keep the cursor a plain property advanced from an event.
51. `resetOn` fires on the address written: an object path resets only when the object itself is replaced, not on a child write — list the leaf paths or use a nonce. A `from` scan skips the fold of the batch that resets it, and a `resetOn` path under `from` raises. A wildcard `from` needs a `for`-rendered or `$listKeys`-declared list (as `$watch` does), and element occurrences belong on `on`, not `from` — equal primitive writes never land, and the binding's initial sync folds too.
52. A `<wcs-state>` that fails to initialize (v2.4) reports once and rejects `connectedCallbackPromise` with the original error, so `renderToString()`, `mount()` and `getBindingsReady(root)` fail instead of hanging; `initializePromise` still resolves. A failed element cannot be re-armed (`setInitialState()` throws), a second root `<wcs-state>` is refused alone, and volumes already waiting for a failed root are orphaned for good — fix the root and reload. As of v2.5 an orphaned volume at least **releases its mount slot**, so a replacement element on the same mount path grafts instead of being rejected as already mounted.
53. Re-setting a state object re-renders the page as of v2.5 (§11): `setInitialState()` on an initialized element re-applies every established binding before it returns, reports what the new state cannot serve as a failed apply, and fires no `$watch` / `$scan` / `$updatedCallback`. Lists are matched by **array identity**, so hand it a new array when a list's length changed — never the instance you pushed into in place. It still throws on a tree with grafted volumes or mounts, on a `mount=` volume element (#268) and on a failed element. On ≤2.4 reads moved to the new generation but the bindings kept showing the first one (#267).
54. On ≤2.3, moving the root `<wcs-state>` in the DOM silently killed every `$on` handler and command-token subscription, and a wildcard `$watch` missed rows added by replacing a nested list with a longer array (while removed rows fired with a neighbour's value). Both are fixed in v2.4 — pin ≥2.4.0 rather than working around them.
55. Writing list elements to swap rows (`$resolve("items.*", [0], b)`, `this["items.0"] = c`) is correct only from v2.5 (§4): the blocks move with their values, `$1` follows, and a value that was not in the list replaces that row in place. The completed swap is render-only, so `$watch` does not fire for rows that merely moved; and `$watch` / `$scan` on a path inside a replaced row's *nested* list does not land for that row (a recorded gap — the page and the state are still correct). On ≤2.4 the page, the reads and the writes all went out of step with the array, silently.
56. On an SSR-hydrated page, the bindings inside server-rendered `for` rows and `if` blocks are applied once as of v2.5 (§11) — that apply is what gives a row getter its dependency edges; before it, such a binding kept the server-rendered text forever while an aggregate outside the rows updated. The inner rows of a nested `for`, mustache text inside rows, a `for` inside an `if`, and `bind-component` children inside rows are still hydration gaps: keep anything that must update out of those shapes, or render them on the client.
57. A "selected row" flag over a long list belongs in `$eqPath` / `$eqIndex` (v2.6, §6), not in `this["items.*.id"] === this.selectedId` — the plain comparison makes every row depend on `selectedId`, so one click re-evaluates the whole list. Pin ≥2.6.1: on 2.6.0 an object key left the previously selected row selected (two rows showed as selected), and a getter path or a parent replaced wholesale never reached the rows. From 2.6.1 they work, but a getter path re-evaluates every row (tracked-read fallback), so key on the written state. Keys compare without coercion, so convert an input's string (`value|number: selectedId`). `$eqIndex` throws outside a list row.
58. Generate the forms 3.0 keeps — each is correct on 2.x too: one `#` with comma-separated modifiers (`onclick#prevent,stop:`), bare structural keywords (`else:` with nothing after it; no modifier or filter on `for` / `if` / `...` itself — right-side filters like `if: n|gt(0)` are fine), no surplus filter arguments, no empty filter, closed quotes, `""` / `null` instead of `undefined` for "no text", and `$resolve(path, indexes)` with two arguments to read. On 3.0 the syntax forms throw at load time (`[wcs/binding-syntax]` / `[wcs/filter-arity]`; lint reports the same codes as errors). On 2.6 they still run the old way with a `wcs/v3-migration` warning (lint: info, not failed by `--strict`), and the value forms warn only when the value actually arrives (§16).
59. `eq(true)` / `ne(false)` / `eq(null)` compare against the **string** on 2.x, so `done|eq(true)` is always `false` for a boolean — silently. v3.0+ reads an unquoted `true` / `false` / `null` / number as the typed value (a quoted argument stays text). Binding the boolean directly (`class.done: done`, `hidden: done|not`) is right on both. Likewise `defaults(null)` falls back to the text `"null"` on 2.x and to `null` on 3.0 (§7).
60. On 2.x, `undefined` reaching `textContent` keeps the previous text — in a reused `for` row that is **another row's** text — and `undefined` / `null` into `attr.*` writes the literal `"undefined"` / `"null"`. v3.0+ empties the text and removes the attribute; element inputs still skip `undefined`. Code for both: return `""` or `null` when there is nothing to show, keep a value in state when it must stay, and bind a real string to an attribute that should be present.
61. The split entries (v3.0+, §1) load from jsDelivr's plain file paths or a bundler, **never `esm.run`** (it re-bundles each entry with its own engine, and features install into a copy the core never sees). A missing feature throws `[wcs/feature-not-installed]` / `[wcs/filter-unknown]`; only a missing `features/diagnostics` is silent (no path warnings). When in doubt, use `/auto`.
62. v3.0 mounts: `#ro` makes the component side read-only (`[wcs/mount-readonly]`), and an explicit partial mount beats a component default of the same name (§12). `$resolve(path, i, undefined)` writes; readonly proxies reject `$resolve` / `$setAll` writes (§6).
