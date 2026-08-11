# @wcstack/state Reference

Sources: `packages/state/README.ja.md` (normative), `packages/state/examples/*`, `packages/fetch/examples/users-crud`, `src/filters/builtinFilters.ts`, `src/bindTextParser/*`, plus `docs/csp.md` / `docs/sri.md` / `docs/state-list-key-design.md` / `docs/architecture-hardening/15-state-component-mechanism-consistency.md`. All verified against real code at v1.26.0.

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
        src="https://cdn.jsdelivr.net/npm/@wcstack/state@1.26.0/dist/auto.min.js"
        integrity="sha384-…"></script>
```

`dist/auto.min.js` is a **self-contained bundle with zero static imports**, so the usual ESM caveat — `integrity` covers the entry but not what it imports — does not apply: one hash covers every line of wcstack that runs. Rules that make it work:

- **Use the version-pinned direct path on `cdn.jsdelivr.net`.** `esm.run` redirects to the `+esm` endpoint, which re-bundles server-side, so a fixed digest can never match there. jsDelivr's plain path does not resolve `package.json` `exports`, so name the real file (`/npm/@wcstack/state/auto` is a 404; `@1.26.0/dist/auto.min.js` is a 200).
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

`<wcs-state>` attributes: `name` (state name, default `"default"`) / `state` / `src` / `json` / `bind-component` (Web Component binding) / `enable-ssr`.

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

### Proxy API (via `this`)

| API | Description |
|---|---|
| `this.$getAll(path, indexes?)` | Get all values of a wildcard path as an array (for aggregation). Partial index specification allowed: `this.$getAll("regions.*.states.*.population", [this.$1])` |
| `this.$resolve(path, indexes, value?)` | Read/write at specific indexes |
| `this.$postUpdate(path)` | Manually emit an update notification |
| `this.$trackDependency(path)` / `this.$untrackDependency(fn)` | Manually register / suppress dependencies |
| `this.$stateElement` | IStateElement access |
| `this.$1`, `this.$2`, ... | Loop indexes |

### Iron rule of state updates

```javascript
this["user.name"] = "Bob";   // ✅ path assignment → DOM update
this.user.name = "Bob";      // ❌ runtime ignores it; lint warns
```

## 7. Filters (fixed at 40 built-ins; no custom registration API)

- Comparison: `eq` `ne` `not` `lt` `le` `gt` `ge`
- Arithmetic: `inc` `dec` `mul` `div` `mod`
- Number formatting: `fix` `round` `floor` `ceil` `locale` `percent`
- String: `uc` `lc` `cap` `trim` `slice` `substr` `pad` `rep` `rev`
- Type conversion: `int` `float` `boolean` `number` `string` `null`
- Date: `date` `time` `datetime` `ymd`
- Truthy/default: `truthy` `falsy` `defaults`

With arguments: `gt(10)`, `substr(0,10)`, `pad(5,0)`, `locale(ja-JP)`, `ymd(/)`, `eq('admin')` (quotes allowed, bare allowed, comma-separated). Chaining: `price|mul(1.1)|round(2)|locale(ja-JP)`. Do transformations the built-ins cannot express in a getter.

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
- Right-side filters are an **error**. `@stateName` propagates. Elements without a wcBindable declaration are an **error**.
- `undefined` state paths are write-skipped for the property (the element default survives). Clear by assigning `null`.

## 10. Other Features

- **Lifecycle**: On the state object: `$connectedCallback` (async allowed, awaited, runs on every reconnection), `$disconnectedCallback` (sync only), `$updatedCallback(paths, indexesListByPath)` (async allowed, not awaited). On the Web Component side: `async $stateReadyCallback(stateProp)`.
- **`$updatedCallback` is binding-driven, not write-driven** (spelled out in v1.26): `paths` lists only the paths whose **live DOM bindings** were applied in that drain. A state write with no binding never calls it and never appears in `paths`. So it cannot be used as a headless watcher — a `$streams` value you want to observe there must actually be bound somewhere in the DOM. There is no state-only `$watch` / `$effects` declaration in the current API.
- **A failure during binding initialization now rejects instead of hanging** (v1.26): `State.getBindingsReady()` used to stay pending forever if `buildBindings` / `hydrateBindings` threw — the symptom was a silent hang at `await`, not an error. It now rejects to the caller. The same reject is plumbed through `_connectedCallbackPromise`, so an `enable-ssr` block that fails makes `renderToString()` return an error and release its mutex instead of wedging.
- **$streams**: `$streams: { name: { args?, source, fold?, initial? } }` — source is `(args, signal) => AsyncIterable|ReadableStream|Promise<same>`, honoring AbortSignal is mandatory, `initial` is required when `fold` is specified. status/error: `$streamStatus.<name>` (`"idle"|"active"|"done"|"error"`) / `$streamError.<name>`. args are synchronous, cannot read wildcards, self-dependency forbidden. Infinite streams require a bounded fold. **Bridging callback APIs (EventSource / WebSocket / DOM events) — v1.22+ canonical form**: wrap in a `ReadableStream` (enqueue in `start`, release the resource in `cancel()`); the runtime cancels the reader on restart/dispose, so the AbortSignal contract is satisfied automatically. Hand-written async generators must watch `signal` themselves — a generator parked on `await` cannot be force-released from outside.
- **Configuration**: `bootstrapState({ locale, debug, enableMustache, bindAttributeName, tagNames: { state }, enableDirectionalInitialSync, enablePropagationContext, enableContractAnalyzer })`.
- **TypeScript**: Wrap with `defineState({...})` for `this` type completion (zero runtime cost).
- **SSR**: `<wcs-state enable-ssr>` + `renderToString()` from `@wcstack/server`.

## 11. Component mechanisms — DCC vs `bind-component` (they are exclusive, v1.26)

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

The outer state stays the source of truth: replacing `rows` wholesale, or writing a single row field (`rows.0.name`), both reach the component's rows, and writing `items.*.name` back from inside reaches the host's `rows`. v1.26 also lifted the nesting restriction — the component may itself sit inside the host's `for` and still run its own `for` (`state.items: groups.*.children`), which before v1.26 hung silently instead of failing. Loop indexes stay **scope-local**: `$1`, event-handler indexes, `$updatedCallback` and `$getAll` all report the position within the component's own scope, so a component can be written without knowing whether it will be placed inside a list. (`packages/state/README.ja.md` still carries the pre-fix "not supported" note for this nested case — the design record `docs/state-bind-component-nested-for-design.md` and ADR-15 §1.10 are the current word.)

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
12. There is no custom filter registration API — do transformations the 40 built-ins cannot express in a getter.
13. The only valid separator for multiple bindings in `data-wcs` is `;`.
14. A property binding is same-value guarded: an `Object.is`-equal primitive write is skipped entirely (no dependency walk, no DOM apply, no `$updatedCallback`). Take repetition from the event-token surface — or from an I/O-node property declared `semantics: "event"`, which is exempt as of v1.24.
15. `$on` handlers are never awaited. An async handler's rejection is reported via `console.error` (v1.24+), not propagated — do not sequence work on it.
16. Under a strict CSP the default state form (inner `<script type="module">`) is blocked — it is imported through a `blob:` URL and the page nonce does not carry over. Move the state to `src="./state.js"`, or open `script-src blob:` knowingly.
17. `$updatedCallback` reports only paths whose live DOM bindings were applied. It is not a headless watcher; an unbound write never reaches it.
18. A `$listKeys` key is the **list path itself** — `"items"` or the nested `"items.*.children"`, never a path ending in `*` (`"items.*"` is rejected). Rows must be plain objects with keys that exist and are unique; a duplicate/missing key or a class instance raises rather than degrading. Remember `this.items !== theArrayYouAssigned` afterwards.
19. DCC and `bind-component` are mutually exclusive per component; a duplicate entry in `$bindables` / `$commands` is an error (it used to silently disable the element's binding surface).
20. `State.getBindingsReady()` rejects on a binding-init failure as of v1.26 — if you `await` it, handle the rejection. (Before v1.26 the same failure hung forever, so an old workaround built around a timeout can be deleted.)
