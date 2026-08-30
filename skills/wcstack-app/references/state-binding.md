# @wcstack/state Reference

Sources: `packages/state/README.ja.md` (normative), `packages/state/examples/*`, `packages/fetch/examples/users-crud`, `src/filters/builtinFilters.ts`, `src/bindTextParser/*`, plus `docs/csp.md` / `docs/sri.md` / `docs/state-list-key-design.md` / `docs/state-watch-hook-design.md` / `docs/architecture-hardening/15-state-component-mechanism-consistency.md`. All verified against real code at v1.32.0.

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
        src="https://cdn.jsdelivr.net/npm/@wcstack/state@1.32.0/dist/auto.min.js"
        integrity="sha384-…"></script>
```

`dist/auto.min.js` is a **self-contained bundle with zero static imports**, so the usual ESM caveat — `integrity` covers the entry but not what it imports — does not apply: one hash covers every line of wcstack that runs. Rules that make it work:

- **Use the version-pinned direct path on `cdn.jsdelivr.net`.** `esm.run` redirects to the `+esm` endpoint, which re-bundles server-side, so a fixed digest can never match there. jsDelivr's plain path does not resolve `package.json` `exports`, so name the real file (`/npm/@wcstack/state/auto` is a 404; `@1.32.0/dist/auto.min.js` is a 200).
- **`crossorigin` is not needed** — `type="module"` is always fetched in CORS mode.
- **Get digests from the GitHub Release** (a table in the body, plus a machine-readable `sri.json` asset), computed from the published tree. Never from jsDelivr's data API: the point of SRI is not trusting the CDN, so letting it self-report is circular.
- **Not covered, by design**: your state definition (inline `<script>` or `src="./state.js"`), route guard scripts, and autoloader-resolved components — all page-supplied code that is dynamically imported at runtime. `dist/index.esm.min.js` is no longer published (v1.26); named imports from `dist/index.esm.js` need import-map `integrity` (Chrome 127 / Safari 18; not Firefox).

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

`<wcs-state>` attributes: `name` (state name, default `"default"`) / `state` / `src` / `json` / `bind-component` (Web Component binding) / `enable-ssr`. As of v1.32, `src` resolves against the **document base URL** — so with `<base href="/ja/">` (the i18n basename pattern), `src="./state.js"` fetches `/ja/state.js`.

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
- **Trusted Types (`require-trusted-types-for 'script'`) is unsupported**: it throws in `@wcstack/fetch`'s `html` binding, `<wcs-layout>` template expansion, and DCC definition.
- **Diagnosing it**: a CSP-blocked dynamic `import()` only rejects with `Failed to fetch dynamically imported module`. state/router subscribe to `securitypolicyviolation` during evaluation and say `... was blocked by Content-Security-Policy` only when a violation was actually observed — if you instead see `Failed to evaluate the inline <script> of state "…"`, it is usually a syntax error in your state module (original error in `cause`).

### Named states

```html
<wcs-state name="cart">...</wcs-state>
<div data-wcs="textContent: total@cart"></div>
```

## 3. `data-wcs` Binding Syntax

```
property[#modifier[,modifier...]][|input filter...]: path[@state][|output filter...]
```

- Multiple bindings are **separated by `;`**: `data-wcs="textContent: count; class.over: count|gt(10)"`
- Filters on the left side (property side) apply in the **DOM→state input direction**: `<select data-wcs="value|number: selectedProductId">`
- Right-side filters apply in the state→DOM output direction.
- Multiple modifiers are comma-separated after a single `#`: `value#ro,init=none: path`

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
- Dot shorthand: `.name` → `users.*.name`, `.` → `users.*` (element value for primitive arrays); `.name|uc` and `.name@state` also work.
- `{{ .name }}` also works inside Mustache.
- Row identity is the element **value** — for objects, the reference. Every non-destructive array method preserves references, so sorting and filtering are structurally keyed and the "wrong key" class of bug cannot occur.

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

### Demand roots — what makes a getter run (documented in v1.31)

Path getters are **lazy**; "does this getter run?" depends on where demand comes from, and there are exactly **three roots**: a **live DOM binding** (demand disappears with the element!), a **`$watch` declaration** (headless), and a **`$streams` `args` function** (evaluated on start and every restart). **`$updatedCallback` is not a root** — it reports what the bindings did. Logic that must not depend on what is rendered belongs on `$watch` or `args`; a display-only element that is secretly the only demand root is the accident `wcs/updated-callback-unbound` now catches statically. Knowing whether a getter is evaluated means inspecting all three places — the linter and the devtools coverage view exist to make a machine do that cross-check.

### Proxy API (via `this`)

| API | Description |
|---|---|
| `this.$getAll(path, indexes?)` | Get all values of a wildcard path as an array (for aggregation). `indexes` is a **prefix** over the path's wildcards — missing levels expand fully, `[]` always means "every match"; **more than the `*` count throws `wcs/index-arity`** (v1.31; earlier versions silently dropped the surplus and returned a plausible wrong value). **Omitting `indexes` entirely defaults to the enclosing loop context** (v1.32) — `this.$getAll("regions.*.prefectures.*.population")` inside a `regions.*` getter narrows to the current region. If the path shares **no** wildcard level with a loop context that holds indexes, `$getAll` **throws** rather than silently reading everything — pass `[]` explicitly for "every match" there |
| `this.$setAll(path, indexes, value, options?)` | v1.32+: write to **every** address a wildcard path matches, in place — see below |
| `this.$resolve(path, indexes, value?)` | Read/write at specific indexes. The index count must match the path's `*` count **exactly** (v1.31: `wcs/index-arity`; loop-context-derived indexes when the argument is omitted are deliberately unchecked) |
| `this.$postUpdate(path)` | Manually emit an update notification |
| `this.$trackDependency(path)` / `this.$untrackDependency(fn)` | Manually register / suppress dependencies |
| `this.$stateElement` | IStateElement access |
| `this.$1`, `this.$2`, ... | Loop indexes |

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

Contracts of the six v1.27 additions:

- `abs` — `Math.abs`; number input required.
- `clamp(min, max)` — both arguments required; saturates into `[min, max]`. Same family as `round`/`floor`: a wire conversion, so it belongs on the binding, not in state.
- `unit(u)` — appends any suffix: `width|unit(px)` → `"40px"`. **Accepts strings as well as numbers on purpose** — the useful chains run through `fix`/`percent`, which return strings. `null`/`undefined` pass through untouched (never `"undefinedpx"`), so "undefined skips the write, null clears" survives the filter. The canonical style-binding chain that keeps presentation out of state: `style.height: samples.*.cpu|clamp(0,100)|fix(0)|unit(%)`.
- `join(sep?)` — array → string; default separator is `", "` (a bare `","` is what `String()` already does, which would make `|join` a no-op).
- `truncate(n, suffix?)` — `n` counts **kept characters** (matching the `slice(0, n)` reading), suffix defaults to `…`; a string at or below the limit is returned untouched.
- `hms(sep?)` — the counterpart of `ymd`: fixed zero-padded `HH:MM:SS` from a Date, locale-independent, separator defaults to `:` — for when locale-formatted `time` is not stable enough.

**Argument trimming is outside-quotes only (fixed in v1.27).** Whitespace inside quotes is literal: `pad(5, ' ')` pads with a space and `join(' / ')` works. On ≤1.26 the quoted whitespace was stripped too — `pad(5, ' ')` silently became a no-op — so if you must target an older CDN pin, avoid whitespace-bearing filter arguments.

**The default locale is `<html lang>` (BREAKING in v1.32; was `'en'`).** The four locale-dependent filters — `locale`, `date`, `time`, `datetime` — read `config.locale`, which now defaults to `<html lang>`, falling back to `'en'`. Always set `<html lang>`; it is the one way the CDN one-liner can set the locale at all. An explicit `bootstrapState({ locale })` still wins; an invalid BCP-47 tag is reported and ignored. **Changing `config.locale` later re-renders nothing** (it is a global setting, not state) — set the language before the page renders (markup, or a synchronous `<head>` script). Per-call overrides (`price|locale(fr-FR)`) are fixed at bind time. For pages that switch language without reloading, translations belong on a path, not in a filter (`docs/i18n-design.md`).

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
- Right-side filters are an **error**. `@stateName` propagates. Elements without a wcBindable declaration are an **error** — statically caught for the built-in helper tags (`wcs-fetch-header` / `wcs-fetch-body` / `wcs-infinite-scroll` / `wcs-voice`) as `wcs/spread-no-bindable` since v1.30. An empty-but-declared contract (`wcs-noise`) is legal: it expands to zero props.
- `undefined` state paths are write-skipped for the property (the element default survives). Clear by assigning `null`.

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
- **`prev` is scalar-only** — it reuses the old value the same-value guard already reads (zero extra cost), so it is `undefined` for reference types, for `$postUpdate`, and when `config.sameValueGuard` is off.
- **No firing condition of its own**: it fires for whatever landed in the batch. Equal primitive writes are already dropped before enqueue (effectively change-only firing), but a `semantics: "event"` occurrence write is *not* dropped and fires with `cur === prev`.
- **Watching a getter makes it eager**: evaluated once at connect and again at the end of every batch touching its dependencies (`prev` = previous evaluation) — an unrendered computed can now fire. You pay that evaluation per batch, and exceptions inside the getter surface through the watch. **Wildcard getters (`items.*.tax`) are not made eager** (priming would sweep the whole list): that form fires only when also DOM-bound, and its `prev` is always `undefined`.
- **Ordering**, three fixed layers, only the middle one yours: mechanisms `$updatedCallback` → `$watch` → `$streams` restart; between handlers, declaration order in `$watch`; between rows of one path, ascending indexes. One thing moves the mechanism layer (v1.32): a `<wcs-view-transition>` accepting the `state` participant puts binding application — and with it `$updatedCallback` — on a **frame**, while `$watch` and the `$streams` restart stay on the original microtask, so the order becomes `$watch` → `$streams` restart → `$updatedCallback` while that tag is present (`for="router"` on the tag keeps state's timing untouched).

Key rules (each of these fails silently or surprisingly if ignored):

1. **Own state only** — a key may not carry `@stateName`; cross-state watching is rejected at declaration time.
2. **A key cannot start with `$`** — so `$streamStatus.<name>` / `$streamError.<name>` cannot be watched directly. The idiom: mirror through a one-line non-`$` getter (`get streamStatus() { return this["$streamStatus.pageResult"]; }`) and watch that — the eager-getter rule is exactly what makes it work unrendered. This is the v1.27 canonical commit boundary for `$streams` (see `io-node-catalog.md`, the intersect-scroll recipe).
3. **Intermediate values are not observable** — a batch `a → b → c` fires once with `cur = c`, `prev = a` (same contract as binding updates).
4. **A headless wildcard row watch requires `$listKeys`** — path expansion is driven by the list's `for` binding, and declaring a watch deliberately does not register the path as a list. With neither a rendered `for` nor `$listKeys`, assigning the array fires the row watch **zero** times. And without `$listKeys`, a whole-array assignment fires **every** row with `prev === undefined`; with it, the key match decomposes into per-field writes, so only changed rows fire and `prev` is a real scalar. Scalar paths (including nested `user.name`) are headless with no such condition.
5. **Handler exceptions are isolated** — reported to the console (and the devtools timeline as `state:watch-error`), remaining watches and stream restarts still run. This differs from `$connectedCallback`/`$updatedCallback`, which fail loudly.
6. **Write chains are bounded at 32 links** — a handler's writes form a new batch; mutually-writing watches are cut off with a console error (`state:watch-chain-limit` in devtools). Nothing is rolled back.
7. **Not available on a mapped `bind-component` child** — the mapping proxy blanks every `$`-prefixed property, so the declaration silently never arrives (same for `$streams`). Declare on the host state, or use a plain (unmapped) child.
8. **SSR never runs watches** — otherwise handler side effects would execute on both server and client.

Tooling knows the declaration (v1.27): `@wcstack/lint` and the VS Code extension validate it — `wcs/watch-declaration-invalid` (error: `@` cross-state key, `$`-prefixed key, empty path segment, non-function handler, and — v1.29 — a whole `$watch` value that is definitely not an object) and `wcs/watch-path-missing` (warning: the key does not exist in the state definition — unlike a binding typo, which visibly fails to render, a `$watch` typo silently never fires). Since v1.28 the runtime's own declaration errors carry the same `[wcs/watch-declaration-invalid]` code plus a lint pointer, so console and CLI speak one vocabulary; v1.31 adds the missing-path side — a `$watch` key that provably does not resolve gets a `console.warn` (`wcs/watch-path-missing`) at declaration time, even for a single segment. And v1.29 makes firing measurable: the runtime emits `state:watch-fired`, which the devtools coverage tab joins against the declared `$watch` keys — each path shows *fired ×N*, *never*, or *prerequisite-missing*, distinguished from "never" so the view does not cry wolf. Since v1.30 the prerequisite check is exact — a wildcard's list counts as satisfied when it is `for`-bound **or** `$listKeys`-declared (the same two conditions rule 4 above states for headless firing), and when neither holds the note says assertively: "this watch can never fire".

## 11. Other Features

- **Lifecycle**: On the state object: `$connectedCallback` (async allowed, awaited, runs on every reconnection), `$disconnectedCallback` (sync only), `$updatedCallback(paths, indexesListByPath)` (async allowed, not awaited). On the Web Component side: `async $stateReadyCallback(stateProp)`.
- **`$updatedCallback` is binding-driven, not write-driven** (spelled out in v1.26): `paths` lists only the paths whose **live DOM bindings** were applied in that drain. A state write with no binding never calls it and never appears in `paths`. So it cannot be used as a headless watcher — that job belongs to `$watch` (§10, v1.27+), which fires with no binding at all.
- **A failure during binding initialization now rejects instead of hanging** (v1.26): `State.getBindingsReady()` used to stay pending forever if `buildBindings` / `hydrateBindings` threw — the symptom was a silent hang at `await`, not an error. It now rejects to the caller. The same reject is plumbed through `_connectedCallbackPromise`, so an `enable-ssr` block that fails makes `renderToString()` return an error and release its mutex instead of wedging.
- **$streams**: `$streams: { name: { args?, source, fold?, initial? } }` — source is `(args, signal) => AsyncIterable|ReadableStream|Promise<same>`, honoring AbortSignal is mandatory, `initial` is required when `fold` is specified. status/error: `$streamStatus.<name>` (`"idle"|"active"|"done"|"error"`) / `$streamError.<name>`. args are synchronous, cannot read wildcards, self-dependency forbidden. Infinite streams require a bounded fold. **Bridging callback APIs (EventSource / WebSocket / DOM events) — v1.22+ canonical form**: wrap in a `ReadableStream` (enqueue in `start`, release the resource in `cancel()`); the runtime cancels the reader on restart/dispose, so the AbortSignal contract is satisfied automatically. Hand-written async generators must watch `signal` themselves — a generator parked on `await` cannot be force-released from outside. **Observing a stream without rendering it (v1.27+)**: `$watch` its value path — or, for status-driven work, mirror `$streamStatus.<name>` through a non-`$` getter and watch that (§10 rule 2). A mapped `bind-component` child cannot declare `$streams` (same blanking as `$watch`).
- **Runtime errors carry self-fix guidance (v1.28+)**: a misspelled filter, an `eventToken.` name missing from `$eventTokens`, a bad `$watch` shape, or a DCC `$bindables` / `$commands` name that does not exist raises with a stable `[wcs/...]` code, a did-you-mean candidate (edit distance ≤ 2, the same criterion the lint CLI uses; DCC suggestions are split by kind, so a `$commands` typo only suggests methods), and a pointer to `npx @wcstack/lint` — attached only where lint detects the same case, so the hint never leads to a clean run. Existing error text is preserved; guidance is appended.
- **Unresolved wired paths warn at binding time (v1.31)**: a bound path that provably does not resolve (`user.nmae`) gets one `console.warn` with `wcs/binding-path-missing` + did-you-mean; a top-level typo throws with the same wording (it used to throw an internal `address.parentAddress is undefined`). The check **under-approximates**: `null`/`undefined` parents, rows of an empty list, sub-properties of a getter's return, mapped `bind-component` child scopes, and `$` namespaces all stay silent — **no warning proves nothing**; run lint for the exhaustive check.
- **One failing binding is confined to that binding (v1.31)**: if applying a binding throws, the rest of the batch, `$updatedCallback`, `$watch`, and `$streams` restarts all still run (before v1.31 one throw took the whole batch down, leaving a half-updated DOM and silently skipping every watch handler). The failure goes to `console.error` and devtools (`state:binding-apply-error`). The shared stance across every limit — propagation hops (32), watch chains (32), apply failures — is **report and continue; values and DOM are never rolled back**.
- **The binding grammar is machine-readable (v1.28+)** — tooling-facing, never needed in app code: `@wcstack/state/manifest` (and `dist/wcs-manifest.json`) now carries the complete vocabulary — modifiers (`prevent`/`stop`/`ro`, `init`/`sync`, the `on` event prefix), the `$1..$N` index params, and every binding type — and the new `@wcstack/state/parser` subpath exposes the canonical binding parser (DOM-free and pure; no position info; invalid syntax throws). This is the parser the lint CLI, the VS Code extension, and devtools all consume as of v1.29, so their diagnostics cannot drift from the runtime.
- **Configuration**: `bootstrapState({ locale, debug, enableMustache, bindAttributeName, tagNames: { state }, enableDirectionalInitialSync, enablePropagationContext, enableContractAnalyzer })`.
- **TypeScript**: Wrap with `defineState({...})` for `this` type completion (zero runtime cost).
- **SSR**: `<wcs-state enable-ssr>` + `renderToString()` from `@wcstack/server`.

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

### `bind-component`: rendering the host's list inside the component

`<wcs-state bind-component="state">` goes inside the shadowRoot; the host writes `data-wcs="state.message: user.name"`. In Light DOM the `name` attribute and `@name` references are required (namespace collisions otherwise). Since v1.26 an array can be bound across the boundary and iterated **inside** the component:

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

Two capabilities the mapping proxy removes from a **mapped** child (a plain, unmapped child keeps them): `$watch` and `$streams` declarations are blanked and silently never arrive — declare them on the host state (§10 rule 7).

### `bind-component` in Light DOM (works as of v1.27)

Binding a **Light DOM** component from the host — `<my-light-component data-wcs="state.message: user.name">` with `<wcs-state bind-component name="my-light">` as a direct child of the component element — used to deadlock (neither `initializePromise` nor `getBindingsReady` ever resolved). v1.27 treats the mapped Light DOM component as **its own binding scope**, so the host form now works just as it does for Shadow DOM. The constraints that remain are structural, not bugs:

- **Two instances carrying the same state `name` cannot live in one scope** — Light DOM shares its namespace with the parent scope. A component stamped on every row of a `for` therefore needs Shadow DOM.
- **`State.getBindingsReady(root)` does not cover the component's scope** — the same contract as the Shadow DOM form, where the child lives in a different rootNode. Await the component's own `<wcs-state>` initialization when you need its contents rendered.

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
20. `State.getBindingsReady()` rejects on a binding-init failure as of v1.26 — if you `await` it, handle the rejection. (Before v1.26 the same failure hung forever, so an old workaround built around a timeout can be deleted.) It never covers a `bind-component` child's scope — Shadow or Light DOM — so await the component's own `<wcs-state>` when its contents matter.
21. `$watch` keys are own-state paths only: no `@stateName`, no `$`-prefix. To react to `$streamStatus.<name>`, mirror it through a non-`$` getter and watch that (the watched getter turns eager, so it evaluates even unrendered).
22. A headless wildcard row watch fires **zero** times without `$listKeys` or a rendered `for`; and without `$listKeys`, a whole-array assignment fires every row with `prev === undefined`. `prev` is scalar-only in all cases.
23. `$watch` handler exceptions are isolated (console + devtools, remaining watches still run), write chains are cut at 32 links, and SSR never runs watches. Mapped `bind-component` children cannot declare `$watch`/`$streams` at all — the declaration silently never arrives.
24. A structural binding (`for` / `if` / `elseif` / `else`) must be alone in its `data-wcs` — sharing the attribute with any other binding raises `[wcs/template-syntax]` and takes the page down (lint-checked as of v1.29).
25. A `[wcs/...]`-prefixed runtime error means the lint CLI reproduces the same finding with a source range — run `npx @wcstack/lint` and fix every instance, not just the throwing one.
26. Getters read only through `this` — an untracked read (`Date.now()`, the DOM, a module variable) keeps its first value forever. State the input as state, or use `$trackDependency` / `$postUpdate`.
27. `$resolve` requires the index count to match the path's `*` count exactly; `$getAll` treats it as an upper bound. Surplus indexes throw `wcs/index-arity` as of v1.31 — on older versions they were silently dropped, returning a plausible wrong value.
28. The non-reactive assignment family (`wcs/nested-assign` / `wcs/array-mutation` / `wcs/array-index-assign`) is **error** severity since v1.31 — `wcs-validate` exits `1` on it, so a CI gate that passed on 1.30 can fail after upgrading the linter. That is the intended behavior; fix the assignments, not the gate.
29. The filters' default locale is `<html lang>` as of v1.32 (was `'en'`) — a page that omits `lang` still formats in English, and changing `config.locale` after render updates nothing. Set `<html lang>` in the markup.
30. `$setAll` broadcasts arrays by default — replacing each row with successive entries needs `{ spread: true }` (length mismatch throws). `undefined` from a mapper means "skip this row", never "write undefined". And omitted `$getAll` indexes default to the **loop context** as of v1.32 — inside a `for`-scoped getter that narrows to the current row; pass `[]` explicitly for "every match".

## 13. Testing a page headlessly (vitest + happy-dom)

A `<wcs-state>` page is plain DOM; nothing in wcstack is test-only. The recipe below is pinned by a contract test in the wcstack repo (`packages/state/__tests__/readme.testingRecipe.test.ts`); the full version with bare-Node and snapshot variants is in the state README, section "Testing Your Page".

`vitest.config.ts`: `test: { environment: "happy-dom", setupFiles: ["./tests/setup.ts"] }`.

`tests/setup.ts` — register once, and route inline `<script type="module">` state through the `data:` URL loader (Node cannot import `blob:` URLs; without this line an inline-script state never finishes loading):

```ts
import { bootstrapState } from "@wcstack/state";
bootstrapState();
URL.createObjectURL = undefined as any;
```

A test:

```ts
import { expect, it } from "vitest";
import { getBindingsReady } from "@wcstack/state";
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

it("renders, re-renders, runs handlers", async () => {
  document.body.innerHTML = `
    <wcs-state json='{"count": 1, "items": ["apple", "banana"]}'></wcs-state>
    <p id="count" data-wcs="textContent: count"></p>
    <ul id="items"><template data-wcs="for: items"><li data-wcs="textContent: items.*"></li></template></ul>
  `;
  const stateEl = document.querySelector("wcs-state") as any;
  await stateEl.connectedCallbackPromise;      // the state element is up
  await getBindingsReady(document);            // every binding under document is built (rejects on init failure)
  expect(document.querySelector("#count")!.textContent).toBe("1");

  await stateEl.createStateAsync("writable", async (s: any) => {   // what a handler does
    s.count = 42;
    s.items = [...s.items, "cherry"];          // reactive form — push() is not observed
  });
  await settle();                              // one macrotask is enough
  expect(document.querySelector("#count")!.textContent).toBe("42");
  expect(document.querySelectorAll("#items li").length).toBe(3);
});
```

- To exercise handlers, keep the state inline (methods included) and dispatch DOM events: `button.click()` on a `data-wcs="onclick: up"` button, then `await settle()`.
- Snapshot: `expect(await renderToString(html)).toMatchSnapshot()` with `renderToString` from `@wcstack/server`.
- Bare Node (no vitest): `const restore = installGlobals(new Window({ url: "http://localhost/" }))` from `@wcstack/server`, then **dynamic-import `@wcstack/state` after it** (a static import at the top of the file registers elements happy-dom cannot construct), run the same steps, `restore()`.
- Blind spots that need one browser e2e (Playwright): happy-dom replaces nodes on a late `customElements.define`, and its event timing differs from real browsers.
