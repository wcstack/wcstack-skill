# @wcstack/state Reference

Sources: the 4.0 engine — wcstack `research/state-engine` `packages/state-next/src` (it becomes `packages/state` at the 4.0 release, with its README rewritten), `docs/migration-v4.md`, and the `research/docs-4x` drafts `docs/state-errors.md` (message numbers) and the 4.0.0 CHANGELOG entry — plus what 4.0 keeps from the 3.x documentation: `packages/state/README.ja.md`, `packages/state/examples/*`, `packages/fetch/examples/users-crud`, `docs/csp.md` / `docs/sri.md` / `docs/state-list-key-design.md` / `docs/state-watch-hook-design.md` / `docs/timing-and-firing-contract.md`. All verified against real code at v3.5.4 <!-- 4.0: stamp — bump to v4.0.0 at release; the 4.0 rules below were checked against the research/state-engine source named above, not against the 3.5.4 package -->, and the 4.0 rules against the 4.0 engine source. **The rules are 4.0's.** A form from 3.x code and what replaced it: §16.

## 1. CDN Loading

```html
<!-- Auto-initialization (the one-liner used in all real examples) -->
<script type="module" src="https://esm.run/@wcstack/state/auto"></script>
```

```html
<!-- Manual initialization -->
<script type="module">
  import { bootstrapState } from 'https://esm.run/@wcstack/state';
  bootstrapState();   // options: notation only (§11 Configuration) — an unknown key throws #44
</script>
```

### Production loading — pin the version and add `integrity`

<!-- 4.0: CDN pin — bump @3.5.4 to @4.0.0 in this section at release -->
```html
<script type="module"
        src="https://cdn.jsdelivr.net/npm/@wcstack/state@3.5.4/dist/auto.min.js"
        integrity="sha384-…"></script>
```

`dist/auto.min.js` is a **self-contained bundle with zero static imports**, so the usual ESM caveat — `integrity` covers the entry but not what it imports — does not apply: one hash covers every line of wcstack that runs. Rules that make it work:

- **Use the version-pinned direct path on `cdn.jsdelivr.net`.** `esm.run` redirects to the `+esm` endpoint, which re-bundles server-side, so a fixed digest can never match there. jsDelivr's plain path does not resolve `package.json` `exports`, so name the real file (`/npm/@wcstack/state/auto` is a 404; `@<version>/dist/auto.min.js` is a 200).
- **`crossorigin` is not needed** — `type="module"` is always fetched in CORS mode.
- **Get digests from the GitHub Release** (a table in the body, plus a machine-readable `sri.json` asset), computed from the published tree. Never from jsDelivr's data API: the point of SRI is not trusting the CDN, so letting it self-report is circular.
- **Not covered, by design**: your state definition (inline `<script>` or `src="./state.js"`), route guard scripts, and autoloader-resolved components — all page-supplied code that is dynamically imported at runtime. Named imports from `dist/index.esm.js` need import-map `integrity` (Chrome 127 / Safari 18; not Firefox).

### Loading only the features a page uses — split entries

`/auto` (or `@wcstack/state` + `bootstrapState()`) ships every feature and **stays the default**: a page that uses everything is smaller as one file than as core plus features, and the one-hash SRI story above holds only for `auto.min.js`. Use a split form only when the user asks for fewer bytes and the page deliberately leaves features out. Two forms:

**The split auto entry** — one tag, no import map:

<!-- 4.0: CDN pin — dist/split/auto.js exists only from 4.0 (nothing to load at 3.5.4); confirm the version at release -->
```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@wcstack/state@4.0.0/dist/split/auto.js"></script>
<wcs-state features="scopes diagnostics">          <!-- the document's root <wcs-state> -->
  <script type="module">
    export default {
      $features: ["temporal", "formats"],           // what THIS state needs
      price: 1200,
      $watch: { price(cur) { /* … */ } },
    };
  </script>
</wcs-state>
<p>{{ price|locale }}</p>
```

- **`features="…"`** on the document's root `<wcs-state>` (the first one without `mount` and `bind-component`) is read once, before `<wcs-state>` is defined: the place for `scopes` (`bind-component`, `mount=`, DCC — it must exist before any `<wcs-state>` starts) and for development aids (`diagnostics`, `devtools`). Only the split auto entry reads it; on another `<wcs-state>` lint warns `wcs/features-invalid`.
- **`$features: ["temporal", "formats"]`** names what a state needs; the split auto entry loads the missing ones before it builds that state, the other entries only check they are installed (`[wcs/feature-not-installed]`). A value that is not an array throws `#46`; a volume may not declare it.
- Names: `formats`, `diagnostics`, `temporal`, `list-keys`, `scopes`, `recursion`, `ssr`, `devtools`. Any other name fails with `[wcs/feature-unknown]` (lint: the same code). Features load from `./features/<name>.js` beside `auto.js`, so only those eight files can ever be imported.
- Load it from a version-pinned plain `/npm/` path, **never `esm.run`**. It is not in `exports`; with a bundler use the import-map form's imports.

**Core plus features through an import map** (or a bundler):

<!-- 4.0: CDN pin — bump @3.5.4 to @4.0.0 in this recipe at release -->
```html
<script type="importmap">
{
  "imports": {
    "@wcstack/state/core": "https://cdn.jsdelivr.net/npm/@wcstack/state@3.5.4/dist/split/core.js",
    "@wcstack/state/features/temporal": "https://cdn.jsdelivr.net/npm/@wcstack/state@3.5.4/dist/split/features/temporal.js",
    "@wcstack/state/features/formats": "https://cdn.jsdelivr.net/npm/@wcstack/state@3.5.4/dist/split/features/formats.js"
  }
}
</script>
<script type="module">
  import { bootstrapState, installFeatures } from '@wcstack/state/core';
  import temporal from '@wcstack/state/features/temporal';  // $watch / $stream
  import formats from '@wcstack/state/features/formats';    // the formatting filters
  installFeatures([temporal, formats]);                      // before bootstrapState()
  bootstrapState();
</script>
```

| Entry | Adds |
|---|---|
| `@wcstack/state/core` | `data-wcs`, `{{ }}` and comment bindings, `for` / `if`, path getters, events (`#direct` included), `$command` / `$on`, `$eq*`, `$errorCallback`, the core filters (`eq ne not lt le gt ge`, `add sub mul div mod abs clamp`, `int float boolean number string nullIfEmpty`, `truthy falsy defaults coalesce`), `bootstrapState`, `installFeatures`, `getBindingsReady` |
| `…/features/formats` | the formatting filters: `toFixed locale upper lower capitalize trim slice padStart padEnd repeat reverse truncate join round floor ceil percent unit date time datetime ymd hms` (§7) |
| `…/features/temporal` | `$watch`, `$stream` |
| `…/features/list-keys` | `$listKeys` (outside the core in 4.0) |
| `…/features/scopes` | `bind-component`, `mount=` volumes, a mounted component's exported getters, DCC (`data-wc-definition`) |
| `…/features/recursion` | `$recursion` and `**` |
| `…/features/ssr` | `enable-ssr` (server rendering and hydration) |
| `…/features/devtools` | the DevTools hook source |
| `…/features/diagnostics` | the sentences of the numbered messages (did-you-mean, the replacement for a removed 3.x name), the bound / `$watch` path warnings (`wcs/binding-path-missing`), the CSP / Trusted Types explanations |
| `@wcstack/state/define` | `defineState` and the types — no runtime |

- **Never load the split form through `esm.run`.** Its `+esm` endpoint re-bundles each entry and inlines the shared core chunk into every one, so each entry carries its own engine and a feature installs into a copy the core never sees — the page throws `[wcs/feature-not-installed]` although `installFeatures` ran. Use the version-pinned plain jsDelivr path (it does not read `exports`: name the file under `dist/split/`) or a bundler; then every relative import resolves to the same chunk URL and the engine is evaluated once. Chunk file names under `dist/split/chunks/` carry a content hash — take them from the version you pin when you list them (preload, import-map `integrity`, Chrome 127 / Safari 18; not Firefox — `docs/sri.md` §5).
- **Under a CSP the split files need only the delivery host** in `script-src`, like `auto.min.js` (no `eval`; the inline-state `blob:` rule of §2 still applies). The split auto entry carries no inline script; the import-map recipe carries **two** — the import map and the bootstrap module — and each needs the page nonce or a hash. `docs/csp.md` §2.1.
- **A missing feature is loud**: a declaration that needs one throws `[wcs/feature-not-installed] <key> needs the add-on @wcstack/state/features/<name>` when the state loads (`$watch` / `$stream` → temporal, `$listKeys` → list-keys, `$recursion` → recursion, `bind-component` / `mount=` → scopes, `enable-ssr` → ssr), and a formatting filter without `formats` throws `[wcs/filter-unknown] … "upper" is in the formats add-on — install it …` when the bindings are planned. **The one silent omission is `features/diagnostics`**: without it messages print as `[wcs/<code>] #<number> <values>` (look the number up in the wcstack repo's `docs/state-errors.md`) and a mistyped bound path gets no console warning at all. Keep it (or `/auto`) while developing, and rely on lint either way.
- `installFeatures` is idempotent (a feature already installed is skipped); call it before `bootstrapState()` — a state that declares a feature's key before that feature is installed fails with `[wcs/feature-not-installed]`.

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

`<wcs-state>` attributes: `mount` (graft this state onto the root tree at that path — see below) / `state` / `src` / `json` / `bind-component` (Web Component binding) / `enable-ssr` / `features` (root only, split auto entry — §1). `src` resolves against the **document base URL** — so with `<base href="/ja/">` (the i18n basename pattern), a relative `src="./state.js"` fetches `/ja/state.js` and 404s. **Under a `<base>`, write the URL root-absolute**: `src="/state.js"`.

A source that cannot load fails the element (§11): `state="<id>"` reads only a `<script type="application/json">` with that id and rejects when there is none (`#16`); a `src="*.json"` that cannot be fetched (`#13`, with the HTTP status) or parsed rejects too. `name=` and `path@name` (v1) are gone: `@` in a path is `#32` with the replacement, lint `wcs/named-state-deprecated` (error).

### Under a Content-Security-Policy the load path decides the directives

| Method | What it does | CSP needed |
|---|---|---|
| `state="<id>"` / `json='{...}'` / `setInitialState()` | `JSON.parse` | **nothing extra** (data blocks are not executed) |
| `src="./state.js"` | normal `import(url)` | `script-src <origin>` |
| `src="./data.json"` | `fetch(url)` | `connect-src <origin>` |
| inner `<script type="module">` (method 5 — the default in every example) | text is extracted and imported through a **`blob:` URL** | **the page nonce on the `<script>` that loads state**, or **`script-src blob:`** |

**The page's nonce rescues method 5 — on the `<script>` that loads state, not on the inner one.** A module's `import()` inherits the nonce of the `<script>` that loaded that module, so `<script type="module" nonce="{RANDOM}" src="https://cdn.jsdelivr.net/npm/@wcstack/state@3.5.4/dist/auto.min.js">` <!-- 4.0: CDN pin — bump to @4.0.0 at release --> admits the `blob:` import under a policy without `blob:` (the browser's rule, not a wcstack feature — checked on Chromium, Firefox and WebKit). A hash cannot do this: a `blob:` module is fetched as an external script, so no inline hash ever matches it. Where no nonce can be issued (static hosting), it is `src="./state.js"` or `script-src blob:`, and opening `script-src blob:` means "allow all dynamically generated scripts", which gives away most of the reason for having a CSP. **Under a strict CSP, `src="./state.js"` stays the preferred form** — it needs neither `blob:` nor the nonce hand-off, and the double run below does not happen. Other consequences worth knowing before you write the policy:

- **The browser evaluates the inner `<script type="module">` too.** Being a child of `<wcs-state>` does not stop it (only a `<template>` does). Its export goes nowhere, so state is unaffected, but with no CSP — or with the nonce on that inner `<script>` as well — **its top-level code runs twice**: once by the browser, once through state's `blob:` import. Under a CSP without a nonce on it, the browser's run is refused and the console shows one violation; state still loads. Either way, **keep side effects out of the top level** (no `fetch`, logging or assignments to globals next to `export default { … }`); do that work in methods or `$connectedCallback`.
- **`<wcs-guard-handler>` goes through `blob:` too, and has no `src=` form.** The nonce on the `<script>` that loads router admits it the same way. Without a nonce, using guards forces `script-src blob:` (router also retries through a `data:` URL, so `script-src data:` would pass too — do not open it; it is the riskier source) — control access on the route-content side instead if the policy must stay strict.
- **`esm.run` needs two hosts** (`https://esm.run` *and* `https://cdn.jsdelivr.net`) because CSP re-checks the redirect target. The version-pinned direct path needs one.
- **Inline import maps need a nonce** (`@wcstack/autoloader` depends on one) and cannot take `integrity`.
- **`class.` / `style.` bindings do NOT need `style-src`** — they are CSSOM property assignments, not attribute parsing or `<style>` injection. And `data-wcs` is never evaluated: no `eval`, no `new Function` anywhere.
- **Trusted Types (`require-trusted-types-for 'script'`).** **Author-written strings are signed** by a shared identity policy named `wcstack` — `<wcs-layout>` templates and `new Worker(src)` — so add `trusted-types wcstack` to the policy **only if the page uses `<wcs-layout>` or `<wcs-worker>`**. **Remote and state data are never signed** — the `html:` / `innerHTML:` / `outerHTML:` / `srcdoc:` bindings (an `<iframe>`'s `attr.srcdoc:` too) and `<wcs-fetch target>` responses need a sanitizing policy *you* install, before the first fetch / layout / worker: `globalThis[Symbol.for("wcstack.trustedTypes.policy")] = trustedTypes.createPolicy("my-app", { createHTML: (s) => DOMPurify.sanitize(s, { RETURN_TRUSTED_TYPE: true }), createScriptURL: (s) => s })` from a nonced head script (bundles: `setTrustedTypesPolicy()` from `@wcstack/state` / `router` / `fetch` / `worker` — same slot). Without one those sinks stay blocked: the diagnostics feature explains it once, and the write fails like any binding (`$errorCallback`, or `binding "…" failed to apply.`). DCC definition has no sink (it clones nodes). Chromium-only — elsewhere every path is a pass-through. Full sink table: `docs/csp.md` §7.
- **Diagnosing it**: a CSP-blocked dynamic `import()` only rejects with `Failed to fetch dynamically imported module` (Chromium; Firefox: `error loading dynamically imported module`). State subscribes to `securitypolicyviolation` and says `The inline <script> of <wcs-state> was blocked by Content-Security-Policy … give the page's nonce to the <script> that loads @wcstack/state, or allow blob: in script-src …` (`#42`) only when a violation was actually observed; `Failed to evaluate the inline <script> of <wcs-state>: <message>` (`#43`) means none was seen — usually a syntax error in your state module. Router says `loadGuardHandler: failed to import guard script …` with the original error in `cause`.

### Security — values, URLs and user content

- **State does not sanitize values.** Text bindings (`textContent:`, `{{ }}`, comment bindings) write text, so a value never becomes markup there. `innerHTML:` / `html:` write HTML: sanitize user content first (and under Trusted Types, through your policy).
- **Validate URLs you bind** to `href:` / `src:` / `attr.href:` — a `javascript:` URL runs on click. Never bind handler strings to `attr.on*:` (state does not refuse it); keep `'unsafe-inline'` out of `script-src` so such a string cannot run.
- **User content must not become page markup.** When state binds the page it reads every `{{ … }}`, `data-wcs` and `<!--@@: … -->` / `<!--@@wcs-text: … -->` under the root (and in route content the router hands it) as a binding — client-side template injection when a non-SSR server template or your own code put user text there. HTML-escaping does not neutralize `{{ }}` (braces are not HTML-special); `$behavior.enableMustache: false` does not stop comment bindings; 4.0 has **no opt-out attribute** (a `data-wcs-ignore` is planned for a later 4.x). Deliver user content through state — `json=` / `src=` / `setInitialState()` / a fetch — and render it with a text binding.
- **SSR output**: keep its comments (§11) — stripping them also lets `{{ }}` inside rendered values be read as bindings on the client.

### Mounting additional state (`mount=`) — volumes

There is **one state tree per rootNode** (document or shadowRoot). To split state across modules, mount a **volume**: its data is grafted onto the root tree at the mount path, and bindings read it by prefix.

```html
<wcs-state src="./app.js"></wcs-state>               <!-- the root: exactly one per rootNode, required -->
<wcs-state mount="cart" src="./cart.js"></wcs-state> <!-- a volume grafted at `cart` -->
<div data-wcs="textContent: cart.total"></div>
<button data-wcs="onclick: cart.add">Add</button>     <!-- a volume's methods are reachable by path -->
```

| In a volume | 4.0 |
|---|---|
| Data, getters (relative to the mount path), methods (`onclick: cart.add`, `this["cart.add"]`), `$connectedCallback` / `$disconnectedCallback` | supported |
| `$watch`, `$listKeys`, `$renderedCallback` | **refused**: the volume is not grafted, `console.error` (`$watch is not run in a volume — declare it on the root state.`) |
| `$stream`, `$recursion` / `**` getters, `$behavior`, `$features` | refused (not grafted) |
| `$commandTokens`, `$eventTokens`, `$on`, `$errorCallback` | not run, `console.warn` — declare them on the root |
| An injection on the volume element (`data-wcs="state.taxRate: settings.taxRate"`) | **refused** (not grafted): read both paths in a root getter — `get cartTotalWithTax() { return this["cart.subtotal"] * (1 + this["settings.taxRate"]); }` |

- **Declare `$watch` / `$listKeys` / `$renderedCallback` on the root state with full paths** (`$watch: { "cart.total"(cur) { … } }`). Inside the root's handlers `this` is the root state. The root's `$renderedCallback(paths, indexes)` receives the paths of the whole tree (`cart.items.*.name`) — filter by prefix: `paths.filter((p) => p.startsWith("cart."))`.
- A refused volume still resolves its `connectedCallbackPromise`; everything under its mount path reads `undefined`. Lint: `wcs/volume-declaration`, `wcs/behavior-invalid`, `wcs/features-invalid`. The lint cannot read a volume loaded with `src=`, so a root `$watch` key or a binding under that mount path gets `wcs/watch-path-missing` / `wcs/binding-path-missing` warnings although it works.
- The **root `<wcs-state>` is required** and may be empty (`<wcs-state></wcs-state>`). Volumes with no root are a loud error. A second root on one root node is refused alone (`#47`; lint `wcs/second-root`).
- **Load order does not matter.** A volume connected before the root is grafted when the root registers; reads under a not-yet-loaded volume return `undefined` and are *not* reported as missing paths. If the root fails to initialize, volumes waiting for it settle with a report of their own — final: fix the root and reload. A volume that settles without grafting releases its mount slot, so a replacement element on the same path grafts.
- **`setInitialState()` on a loaded volume element throws** — the graft copies the volume's data into the root tree once. Write the paths under the mount path on the **root** state instead.
- The mount path is **static and dotted** (`settings.theme` is fine). `*`, `$`, `#`, `@` and empty segments are rejected — at runtime (not grafted) and as `wcs/mount-path-invalid` (error) in lint. Changing `mount` after initialization does nothing. A path the root state already has, or one another volume holds, is refused (`will not graft: the root state already has "…"`); replacing a mount point's parent wholesale from the root (`this.settings = {...}` under `mount="settings.theme"`) throws.
- A volume written as a `class` grafts its prototype accessors and methods; an own data key still shadows a prototype getter. Any `data-wcs` on the volume element counts as an injection (refused).
- A `<wcs-state mount>` inside the shadow root of a component that is wired to its host is refused (`will not graft: its component is wired to its host.`) — a wired component reads the host's tree, so put that data in the host's state.
- Cross-module reads are ordinary paths: a root getter reading `this["cart.total"]` tracks the dependency like any other.

## 3. `data-wcs` Binding Syntax

```
property[#modifier[,modifier...]][|input filter...]: path[|output filter...]
```

- Multiple bindings are **separated by `;`**: `data-wcs="textContent: count; class.over: count|gt(10)"`. `;`, `|`, `:` and the filter parentheses split only **outside quotes**, so a quoted argument may contain them (`tags|join('; ')`, `value|defaults('00:00'): .startTime`, `join(')')`).
- There is **no `@state` selector** — `@` in a path is a parse error (`#32`). Read another module's state through its mount prefix (`cart.total`, §2).
- Filters on the left side (property side) apply in the **DOM→state input direction**: `<select data-wcs="value|number: selectedProductId">`
- Right-side filters apply in the state→DOM output direction.
- Multiple modifiers are comma-separated after a single `#`: `value#ro,init=none: path`
- **Refused when the bindings are set up** — `[wcs/binding-syntax]` (`#1xx`) / `[wcs/template-syntax]` (`#2xx`) / `[wcs/filter-arity]`, the same codes the lint reports as errors. At page level the `<wcs-state>` then fails to initialize and the bindings after the error are not attached (4.0 preview behaviour, still under review); inside a `for:` / `if:` row an error found while attaching goes to `$errorCallback` as that binding's failure:

  | Refused | Write |
  |---|---|
  | A second `#` (`value#ro#wo`) | `value#ro,wo` |
  | A value after `else:`; modifiers or left-side filters on `for` / `if` / `elseif` / `else` / `...` (`if#ro:`, `for\|f:`) | The bare keyword (right-side filters such as `if: count\|gt(0)` stay valid) |
  | **Any filter on `for:`** (`for: items\|take(2)`, #121) | A getter that returns the filtered list (§4) |
  | `for` / `if` / `elseif` / `else` sharing one `data-wcs` with another binding (#201); `elseif:` / `else:` not after an `if:` (#202) | A structural binding alone on its `<template>` |
  | `outerHTML:` / `outerText:` inside a `for:` / `if:` template (#203) | `innerHTML:` on a wrapper element |
  | An unterminated quote, an empty filter (`x\|`, `x\|\|y`), text after a filter's `)` (`n\|toFixed(2)upper`) | Closed quotes; `n\|toFixed(2)\|upper` |
  | More filter arguments than the filter takes, or fewer than it needs | The filter's own arity (§7) |
  | An empty path segment on the right (`textContent: a.`, `a..b`) | The real path — a **leading** dot is the loop shorthand (`.name`, `state: .`) |
  | A left side that names no property (`": x"`, `"#ro: x"`); a dotted namespace word (`.class:`, `.attr:`, `.style:`, `.command:`, `.eventToken:`, `.state:`) | Name the property; the namespaces are undotted |
  | A `__proto__` / `prototype` segment anywhere in a path (#120 — in writes, `$resolve`, `$setAll` and reads too) | — |
  | A path over 512 segments | Real paths are under ten |
  | A `*` in a row that ranges over another list than the enclosing `for:` (`{{ b.*.y }}` inside `for: a`, `[wcs/wildcard-rank]` #1403); `state: .` or a `.`-path outside any `for:` (#1402) | Read the other list's row in a getter with `$resolve(path, indexes)` |
- **A modifier never changes the kind of binding:** `radio#ro:` / `checkbox#ro:` stay radio / checkbox bindings.
- **Empty values:** display surfaces — `textContent` / `innerText` / `innerHTML`, `{{ }}` and comment bindings, `attr.*`, `style.*`, `class.*` — treat `undefined` and `null` alike: the text is emptied, the attribute or style removed, the class taken off. Element inputs (every other property, spread) skip `undefined` (the element keeps its own default) and clear on `null`. The formatting filters `upper` / `lower` / `capitalize` / `trim` / `slice` / `padStart` / `padEnd` / `repeat` / `reverse` / `truncate` / `unit` pass `undefined` / `null` through. The filters for which an absent value *is* the input (`defaults` / `coalesce` / `nullIfEmpty` / `boolean` / `truthy` / `falsy` / `not` / `eq` / `ne`) read it as such; the conversions and the number / date / array families do not pass it through — a filter that requires a number, a date or an array throws (`#28`–`#30`), confined to that binding and routed to `$errorCallback`.

### What is bound, and in which order

- **The children of an element whose content a binding sets are never bound** — `textContent:`, `text:`, `innerText:`, `innerHTML:`, `html:` (and `outerHTML:` / `outerText:`, which replace the element): `{{ }}`, `data-wcs` and templates in them stay literal, also when `#init=element` / `#init=none` leaves the children you wrote in place. Put markup that needs bindings in a separate element.
- **The children of `<noscript>` and `<iframe>` are not bound** (nor of `<script>` / `<style>`); the element's own `data-wcs` (`srcdoc:`, `attr.src:`) still binds.
- **At page level an element's children are bound before the element's own bindings** — a custom element's first property writes, and the order in which `$errorCallback` receives failures, run children first. Inside templates the order is document order.
- What a binding puts into the page is a value, not markup: rendered text, `innerHTML:` content and a custom element's own rendering are never scanned for bindings.

### Property types

| Property | Description |
|---|---|
| `value` | Element value (two-way for input/select/textarea) |
| `checked` | checkbox/radio checked state (two-way) |
| `textContent` / `text` | Text (`text` is an alias) |
| `html` | innerHTML |
| `class.NAME` | CSS class on/off. **The value must be a `boolean`** — a truthy string or number throws `[wcs/binding-type-expectation]` #401 on every apply. Write `class.on: count\|gt(0)`, or `class.on: label\|truthy` when you really mean "coerce". `undefined` / `null` remove the class |
| `style.PROP` | CSS style property — the DOM name (`style.backgroundColor`) or the CSS name (`style.background-color`, a custom property `style.--gap`); `undefined` / `null` remove it |
| `attr.NAME` | Attribute setting (SVG namespace supported) |
| `radio` | Radio group → single value (two-way) |
| `checkbox` | Checkbox group → array (two-way) |
| `onclick`, `on*` | Event handlers (§8) |

In addition, any DOM property name can be used (e.g. `disabled: createFetch.loading`).

**A name starting with `on` is always an event binding.** `online: x` listens for a `"line"` event, and `once: flag` on `<wcs-timer>` / `<wcs-raf>` / `<wcs-resize>` / `<wcs-intersect>` listens for `"ce"`. In both cases the value never arrives, silently. **Put a dot in front to bind the property** — `.online: isOnline`, `.once: flag`. The dotted form is the same binding as the undotted one, except that it is never an event: `.value:` is two-way, and modifiers and input filters apply. Lint reports an undotted `on*` member of a built-in tag as `wcs/on-prefixed-member` (warning).

### Modifiers

| Modifier | Description |
|---|---|
| `#ro` | Read-only (disables two-way binding) |
| `#prevent` | `event.preventDefault()` |
| `#stop` | `event.stopPropagation()` |
| `#direct` | Put the `on*:` listener on the element instead of delegating it to the root — §8. On a binding that is not an event binding, lint warns `wcs/template-syntax` |
| `#onchange` | Two-way binding on the `change` event instead of `input` |
| `#init=state\|element\|auto\|none` | Binding authority for wcBindable elements: decides ONLY who wins the initial sync — two-way members flow both ways afterwards. `#init=element` is the declarative load-before-bind form: `<wcs-storage data-wcs="value#init=element: todos">` keeps the persisted value at bind, then writes back normally. Needs `enableDirectionalInitialSync` (on by default; `#31` when a state turned it off) |
| `#sync=call\|connect` | Snapshot read timing under element authority (`connect` also holds state→element writes until the initial conflict resolves) |

### Two-way binding (auto-enabled)

`<input>` (value/checked/valueAsNumber/valueAsDate), `<select>` (value, change event), `<textarea>` (value). `<input type="button">` is excluded.

### Text: `{{ }}` and comment bindings

```html
<p>Hello, {{ user.name }}!</p>                   <!-- mustache: shows the braces until state binds (FOUC) -->
<p>Hello, <!--@@: user.name-->!</p>              <!-- comment binding: renders nothing until bound -->
<p>Total: <!--@@wcs-text: total|locale--></p>    <!-- the same, with the wcs-text keyword -->
```

- Both are the same text binding — filters included, at page level and inside templates; the comment is replaced by a text node at its position. The expression may span lines.
- **At page level prefer the comment binding (or `textContent:`)**: `{{ }}` outside a `<template>` is visible until state has loaded (lint: `wcs/template-syntax`, info). Inside `<template>`s (`for:` / `if:` rows) `{{ }}` is fine — template content is inert until rendered.
- `{{ }}` follows `$behavior.enableMustache` (on by default); **comment bindings bind even with `enableMustache: false`**.
- The keyword is empty or `wcs-text` — nothing else (no renaming option exists). A comment inside `<textarea>` or `<title>` is not bound (the browser parses that content as text): bind `value:` / `textContent:` there.

## 4. List Rendering (`for`)

```html
<template data-wcs="for: users">
  <div>
    <span data-wcs="textContent: users.*.name"></span>  <!-- full path -->
    <span data-wcs="textContent: .name"></span>          <!-- dot shorthand -->
  </div>
</template>
```

- No key attribute needed (identity-based diffing). Arrays must **always be reassigned as new arrays** (`concat`/`toSpliced`/`filter`/`toSorted`/`toReversed`/`with`). The runtime does not observe `push`/`splice`/`sort` or direct index writes such as `this.items[0] = value`; lint reports these as `wcs/array-mutation` / `wcs/array-index-assign` (errors).
- Dot shorthand: `.name` → `users.*.name`, `.` → `users.*` (element value for primitive arrays); `.name|upper` also works. `{{ .name }}` also works inside rows.
- **Row identity is the element value** — for objects, the reference. When you assign a new array, rows are matched to its elements by identity and move with them; every non-destructive array method preserves references, so sorting and filtering are structurally keyed.
- **`for:` takes no filters** (`for: items|take(2)` → `[wcs/binding-syntax]` #121). A row of `for: items` is `items.<index>`, so the rows of a filtered array would name other elements. Declare a getter that returns the filtered or sorted list and loop over it: `get firstTwo() { return this.items.slice(0, 2); }` + `for: firstTwo`.
- **Writing a list element replaces the value at that position.** `this["items.0"] = c` and `$resolve("items.*", [0], c)` keep the row where it is, with its `$1` and the DOM state bindings do not own (focus, text typed into an unbound input, `<details>` open state); everything derived below the row is computed again, and `$watch("items.*")` fires for that position. **To move rows with their values, assign a new array** (a swapped copy, `toSorted`):

  ```js
  const items = this.items.slice();
  [items[0], items[1]] = [items[1], items[0]];
  this.items = items;
  ```
- **Replacing an element updates every read below it**: `this["items.0"] = { ...this["items.0"], name: "z" }` — the form `wcs/array-index-assign` tells you to write — makes `this["items.0.name"]`, `$getAll("items.*.name", [])` and row getters read the new object, with or without a `for:`.
- **An index past the end**: a write (`this["items.5.v"] = 1`, `$resolve("items.*.v", [5], 1)`) throws `no row for "items.*.v"` (`#3`) and changes nothing; a read returns `undefined`. Grow the list by assigning a new array first.
- **`data-wcs` is removed from the elements cloned for rows (and `if:` branches)** — CSS or test selectors such as `[data-wcs*="items"]` do not match them. Use a class or a `data-*` attribute of your own.
- **A `for:` over a getter.** When the getter returns the list itself (`get shown() { return this.todos; }`), writes through its rows — a two-way `checked: .done`, `this["shown.0.done"] = true` — reach the source list, its readers and `$getAll`, and other `for:`s over it. When it returns a **filtered copy**, the row objects are reachable from two lists, and a write below one row does not reach the other list's row bindings and row getters (known 4.0 limitation, #365). For the TodoMVC shape, toggle from a handler that reassigns the source list with a new row object — `toggle(e, i) { const id = this.shown[i].id; this.todos = this.todos.map((t) => t.id === id ? { ...t, done: !t.done } : t); }` (`i` is the position in `shown`) — so the filter getter, the count and every `for:` recompute from the new array.
- **One object at two positions** (`items: [o, o]`) has the same limitation: a write through `items.0.name` does not reach `items.1`'s bindings; plain reads, root getters and `$getAll` see the new value. Give each position its own object.

### `$listKeys` — identity across a refetch

The exception to identity is **data that arrives as freshly created objects**: `(await fetch(...)).json()`, `JSON.parse` out of storage, a full-snapshot WebSocket/SSE push, a worker `postMessage`. No row matches by reference, so every row is torn down and rebuilt — and DOM state the bindings do not own (focus, an in-progress IME composition, `<details>` open/closed, in-row scroll position, `<canvas>` pixels, `<video>.currentTime`) is not merely lost but **shuffled between rows**. Declare a key and rows survive the refresh:

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

- **Opt-in and per-path.** Undeclared lists behave exactly as before at zero extra cost. Nesting is opt-in too — only declared paths are key-matched.
- **An unchanged refresh is free**: no field writes, no DOM work. A keyed refresh fires `$watch` only for the fields that changed, with a real `prev` (§10).
- **Rows must be plain objects**, and keys must exist and be unique. A duplicate, missing, or class-instance key is an immediate error. The declaration is validated when the state is installed: empty paths, empty segments, a trailing `*` (declare `items`, not `items.*`), non-flat key field names (no `.`/`*`), and `Object.prototype` names are rejected.
- **A field that disappears from a row is cleared to `null`** — `null` is this package's explicit "clear" vocabulary, while `undefined` means "no value" and skips the write.
- **The stored array is rebuilt from the matched row objects**, so after assignment `this.items !== theArrayYouAssigned`.
- Declare it on the **root** state or in a mounted component (its own lists); a volume declaring it is not grafted. On `/core` install `features/list-keys`.
- `@wcstack/lint` and the VS Code extension follow the declaration, so `for: items.*.children` completes and validates even when `items` starts as `[]`.

### Nested loops

```html
<template data-wcs="for: regions">
  <template data-wcs="for: .states">        <!-- .states → regions.*.states -->
    <span data-wcs="textContent: .name"></span> <!-- → regions.*.states.*.name -->
  </template>
</template>
```

An inner array held by several outer rows (`const inner = […]; groups: [{ items: inner }, { items: inner }]`) is drawn and written consistently — writes land on the element written, and every list that renders it follows — except where one object is reached through two arrays (the limitation above). Copy per row (`groups.map(g => ({ ...g, items: [...g.items] }))`) when rows must diverge.

### Loop index

- Inside getters/handlers: `this.$1` (outer), `this.$2` (inner), ... — `$1`…`$128`; `$0` / `$129` / `$01` throw `[wcs/index-param-range]`.
- Inside templates: `{{ $1|add(1) }}` (1-based row number); an outer index inside a nested template follows its row after a reorder.
- `.length` paths also work: `data-wcs="if: cart.items.length|gt(0)"`

## 5. Conditional Rendering (`if` / `elseif` / `else`)

```html
<template data-wcs="if: count|gt(0)"><p>Positive</p></template>
<template data-wcs="elseif: count|lt(0)"><p>Negative</p></template>
<template data-wcs="else:"><p>Zero</p></template>
```

- `else:` **requires the trailing colon** (no right side). Nested `if` is allowed. The condition is coerced with `Boolean()`, so a falsy non-boolean (`0`, `""`, `undefined`, `null`) shows the `else:` branch, and `|not` accepts any value.
- **A structural binding must be the only binding in its `data-wcs`** (#201); put other bindings on elements inside the template.

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
- **Numeric indexes are ordinary path segments**: `this["users.0.name"]`, `` this[`cart.items.${i}.quantity`] += 1 ``, `{{ users.1.name }}`, `groups.0.items.1.v`, `for: groups.0.items` — they read, write and follow writes on any list, rendered or not. A `$watch` key with a numeric index (`"items.0.v"`) fires only when the value at that index changes.
- **Numeric keys under a plain object** (`sales.2024.total`, `usersById.42.name`) are the exception (known 4.0 limitation): markup renders them, but a script read (`this["sales.2024.total"]`, also inside a getter) gives `undefined`, `$eq` on such a path is always false, a write throws `no row for "sales.*.total"`, and a two-way write-back fails. Read `this.sales[2024].total`, and write by assigning a new object to the top-level key (`this.sales = { ...this.sales, 2024: { ...this.sales[2024], total: 10 } }`) — or use keys that are not numbers.
- **Writing a top-level key the state does not have creates it** (reading one throws `[wcs/binding-path-missing]`). Declare every key; a write typo is otherwise silent.
- Chaining into a getter's returned object works: `this["cart.items.*.product.price"]`.

### Getters must be pure with respect to state

The cache is invalidated **only** through the dependency graph, and the graph records only what the getter read **through `this`**. Everything else is invisible to invalidation, so the first value computed is the value you keep — forever, with no warning:

```javascript
get stamp() { return `${this.label} @ ${Date.now()}`; }  // ❌ Date.now() untracked — never recomputes
get theme() { return document.body.dataset.theme; }       // ❌ the DOM is untracked
get total() { return this.price * exchangeRate; }         // ❌ a module variable is untracked
```

The rule: **read only through `this`; never write state or touch the DOM from a getter.** When an untracked input genuinely must participate, put it into state and assign to it (`now: Date.now()` seeded, then `this.now = Date.now()` on a timer in `$connectedCallback`), or use the escape hatches — `$dependOn(path)` (register an extra dependency), `$postUpdate(path)` (announce an untracked change from outside), `$untracked(fn)` (read without registering). Getters that throw are not swallowed: the exception surfaces where the getter was evaluated (a binding apply, a `$watch` evaluation, or your own read). Mutually-recursive getters are a reported cycle (`[wcs/getter-cycle]` #701).

### Dependency tracking boundaries

Three rules decide what the graph sees. None matters until you cross one, and the symptom is always *a value that stops updating with no error*:

| Rule | What it looks like when crossed |
|---|---|
| **Only path reads through `this` are tracked.** `this.form` tracks `form`; `this["form.name"]` tracks `form.name`; **`this.form.name` tracks `form` only** — the `.name` is a plain property access on the object that came back | A getter reading `this.form.name` does not re-run when a bound `<input data-wcs="value: form.name">` changes — read `this["form.name"]`. `wcs-validate` and the VS Code extension report **`wcs/getter-untracked-read`** (warning) when a getter reads `this.form.name` and the document writes `form.name` somewhere; a root that is only ever replaced wholesale is left alone, and so are array roots (`this.items[0].name` — `items` suffices) |
| **Reads inside a setter are not tracked.** A setter is an imperative assignment, not a derivation | A setter that reads `this.a` to decide what to write does not run again when `a` changes — only a getter re-runs. `$untracked(fn)` applies this rule to a getter on purpose |
| **The same-value guard is primitive-only.** An `Object.is`-equal primitive write is dropped before anything is enqueued; an object or array write always passes, even the same reference | Assigning the same string again fires nothing; assigning the same object again re-fires its bindings and `$watch` (`semantics: "event"` properties are exempt either way). `$behavior: { sameValueGuard: false }` turns the guard off for that tree |

The storage "persist a form as one object" recipe (`io-node-catalog.md` §2) is where the first rule bites most often: the accessor pair's getter must read `this["form.name"]`, not `this.form.name`.

### Demand roots — what makes a getter run

Path getters are **lazy**; "does this getter run?" depends on where demand comes from, and there are exactly **three roots**: a **live DOM binding** (demand disappears with the element!), a **`$watch` declaration** (headless), and a **`$stream` `args` function** (evaluated on start and every restart). **`$renderedCallback` is not a root** — it reports what the bindings did. Logic that must not depend on what is rendered belongs on `$watch` or `args`; a display-only element that is secretly the only demand root is the accident `wcs/updated-callback-unbound` catches statically.

### Proxy API (via `this`)

| API | Description |
|---|---|
| `this.$getAll(path, indexes?)` | Get all values of a wildcard path as an array (for aggregation). `indexes` is a **prefix** over the path's wildcards — missing levels expand fully, `[]` always means "every match"; **more than the `*` count throws `wcs/index-arity`**. **Omitting `indexes` defaults to the enclosing loop context** — `this.$getAll("regions.*.prefectures.*.population")` inside a `regions.*` getter narrows to the current region. If the path shares **no** wildcard level with a loop context that holds indexes, it throws (`#6`) rather than silently reading everything — pass `[]` explicitly there. A non-array `indexes` throws |
| `this.$setAll(path, indexes, value, options?)` | Write to **every** address a wildcard path matches, in place — see below |
| `this.$resolve(path, indexes, value?)` | Read/write at specific indexes. The index count must match the path's `*` count **exactly** (`wcs/index-arity`). **The argument count decides** — two arguments read, three write (`undefined` included). On a readonly proxy (`createState("readonly", …)`) a write throws `This state is readonly.` (`#8`), and so does `$setAll` |
| `this.$postUpdate(path)` | Manually emit an update notification (reaches keyed-selection rows too) |
| `this.$dependOn(path)` / `this.$untracked(fn)` | Manually register / suppress dependencies |
| `this.$eq(path, key)` / `this.$eqPath(path, keyPath)` / `this.$eqIndex(path, level?)` | Keyed subscription — "is `path` equal to this row's key?" without a dependency on `path` from every row. See below |
| `this.$stateElement` | IStateElement access |
| `this.$1`, `this.$2`, ... | Loop indexes, `$1`…`$128` (`$129` / `$0` / `$01` throw `wcs/index-param-range`) |

### `$setAll` — bulk writes that keep the array

The write-side counterpart of `$getAll`. The point is not brevity but **list identity**: `this.users = this.users.map(...)` throws away row identity, per-row getter caches, and the render diff; `$setAll` decomposes into in-place per-row writes, so the array survives.

```javascript
this.$setAll("users.*.selected", [], e.target.checked);            // broadcast (same value everywhere)
this.$setAll("users.*.selected", [], cur => !cur);                 // mapper: (current, ...indexes)
this.$setAll("users.*.score", [], (cur, i) => i < 3 ? cur * 2 : undefined);  // undefined = skip this row
this.$setAll("matrix.*.*", [0], 0);                                // indexes prefix: row 0 only
this.$setAll("users.*", [], rows, { spread: true });               // one entry per address, in match order
```

- Three forms: a **function** is a mapper; **anything else broadcasts** (arrays included — the target may itself be array-valued); an array **plus `{ spread: true }`** hands one entry per matched address, and a length mismatch throws (`#10`) rather than misaligning.
- `undefined` is never written ("skip this address" in all three forms — a mapper that forgets to `return` wipes nothing); use `null` to clear. Returns the number of addresses written.
- `indexes` is a prefix exactly as in `$getAll` but **required** (`#9`) — writes get no implicit loop context, so inside a `for` template `$setAll("users.*.selected", [], true)` still means *every* user, never the current row.
- Not a shortcut for the dependency walk: each write is enqueued individually (cost matches the hand-written loop); rendering still coalesces into one batch.

**A path's depth is fixed in its string.** `nodes.*.children.*.total` is depth 2 and nothing stretches it to 3. For a tree whose depth is decided by the data, declare `$recursion` and write `**` — §14.

### Keyed selection — `$eq` / `$eqPath` / `$eqIndex`

A row getter that answers "is this row the selected one?" is where dependency tracking scales worst: `get "items.*.selected"() { return this.$1 === this.selectedIndex; }` (or `this["items.*.id"] === this.selectedId`) makes **every** row depend on the selection path, so one click re-evaluates the whole list. The keyed forms read the selection path **without** a dependency and subscribe each row under **its own key**, so a write to the path re-evaluates only the row that was selected and the row that becomes selected:

| API | Key | Selection follows | Notes |
|---|---|---|---|
| `this.$eq(path, key)` | any value you pass | the key | Pass a tracked read (`this["items.*.id"]`) when the key itself can change, `this.$untracked(() => …)` when it cannot |
| `this.$eqPath(path, keyPath)` | the value at `keyPath` (its wildcards resolve to this row) | the id | Reads the key untracked too, so reordering or replacing the list never re-evaluates the rows. **Survives sorting and removal** — the default choice |
| `this.$eqIndex(path, level = 1)` | this row's index (`$1`; `level` picks the wildcard in a nested list) | the position | Unlike reading `$1`, the getter is not recorded as index-dependent — removing a row re-evaluates at most two rows |

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

Rules:

- **What reaches the rows** — a write to `path` of any value, objects included (`this.selected = row` with `$eq("selected", this["items.*"])`), a write that replaces an object above it (`this.selection = { id }` under `$eqPath("selection.id", …)`), and `$postUpdate(path)`: the row that was selected and the row that becomes selected.
- **A getter as `path`**, a path under one, or a path with a numeric index falls back to an ordinary tracked read: the selection is correct, but a change re-evaluates every row — point `path` at the written state (`selectedId`) to keep the two-row cost.
- **Keys compare like `Map` keys** (`Object.is`, except `+0`/`-0` and `NaN`/`NaN` count as equal), so no type coercion: a selection written as the string `"2"` by an `<input>` / `<select>` never matches numeric ids — convert on the way in (`value|number: selectedId`).
- `$eqPath` reads the key without a dependency, so a row whose key changes **in place** is not re-evaluated by that change — use it for identities that do not change (ids), and `$eq` with a tracked key read when the key itself is live.
- They subscribe only when evaluated inside a getter; called from a method or a handler, `$eq` / `$eqPath` just return the comparison. `$eqIndex` needs a list row: in a getter outside a row it throws `$eqIndex("…") needs a list row scope.` (`#7`). A row's subscription is dropped when the list diff removes the row.
- Inside a `mount=` volume or a `bind-component` scope they resolve against that scope, like `$getAll` / `$setAll` / `$resolve` / `$postUpdate`.
- **DevTools:** the State pane counts the subscriptions per path under **Keyed selection** and marks a path that fell back to a tracked read with a `tracked` badge.

### Iron rule of state updates

```javascript
this["user.name"] = "Bob";   // ✅ path assignment → DOM update
this.user.name = "Bob";      // ❌ runtime ignores it; lint wcs/nested-assign (error)
```

## 7. Filters (47 built-ins; no public registration API)

- Comparison: `eq` `ne` `not` `lt` `le` `gt` `ge`
- Arithmetic: `add` `sub` `mul` `div` `mod` `abs` `clamp`
- Number formatting: `toFixed` `round` `floor` `ceil` `locale` `percent` `unit`
- String: `upper` `lower` `capitalize` `trim` `slice` `padStart` `padEnd` `repeat` `reverse` `truncate` `join`
- Type conversion: `int` `float` `boolean` `number` `string` `nullIfEmpty`
- Date: `date` `time` `datetime` `ymd` `hms`
- Truthy/default: `truthy` `falsy` `defaults` `coalesce`

The comparison, arithmetic (except the number formatting), conversion and truthy/default families are the core set; the formatting filters come from `features/formats` (`/auto` and the full entry install both — §1). There is no `substr` (write `slice(start, start + length)`; `slice` takes the end index) and none of the 3.x short names (`uc`, `inc`, `fix`, `pad`, `null`, … — §16): an unknown name throws `[wcs/filter-unknown]` #501, and for a removed 3.x name the diagnostics feature names the replacement instead of a did-you-mean.

With arguments: `gt(10)`, `slice(0,10)`, `padStart(5)` or `padStart(5,'0')` — quote the pad character, since an unquoted `0` is a typed *number* and lint reports `wcs/filter-arg-type` — `locale(ja-JP)`, `date(ja-JP)`, `ymd(/)`, `eq('admin')` (quotes allowed, bare allowed, comma-separated). Chaining: `price|mul(1.1)|round(2)|locale(ja-JP)`. Do transformations the built-ins cannot express in a getter.

**Filter arguments are typed.** Unquoted `true` / `false` / `null` / numbers are typed literals, quoted arguments are strings: `done|eq(true)` matches `true`, `eq('true')` does not, `eq(null)` matches `null`; a non-string literal compares as itself (a number never equals `null` or `true`), and a form value `"1"` still matches `eq(1)`. `defaults(v)` returns the typed value (`defaults(0)` → `0`; `defaults('0')` for the text). `truthy` / `falsy` / `defaults` use JavaScript truthiness (`0n` is falsy). Still prefer binding a boolean directly (`class.done: done`, `hidden: done|not`). `coalesce(v)` replaces only `null` / `undefined` while `defaults(v)` replaces every falsy value (`0`, `false`, `""` included) — pick `coalesce` for a count that may legitimately be `0`. `add` / `sub` require their argument.

**Arity is checked** (`[wcs/filter-arity]`, the bounds lint uses): `join(a,b)` throws "accepts at most 1 argument(s)"; `date` / `time` / `datetime` / `locale` / `toFixed` / `round` / `floor` / `ceil` / `percent` / `join` / `ymd` / `hms` take 0–1, `slice` / `padStart` / `padEnd` / `truncate` 1–2, `clamp` 2. `Object.prototype` names (`|toString`, `|valueOf`) are `wcs/filter-unknown`.

Contracts worth knowing:

- `abs` — `Math.abs`; number input required.
- `clamp(min, max)` — both arguments required; saturates into `[min, max]`. Same family as `round`/`floor`: a wire conversion, so it belongs on the binding, not in state.
- `unit(u)` — appends any suffix: `width|unit(px)` → `"40px"`. **Accepts strings as well as numbers on purpose** — the useful chains run through `toFixed`/`percent`, which return strings. `null`/`undefined` pass through untouched (never `"undefinedpx"`). The canonical style-binding chain that keeps presentation out of state: `style.height: samples.*.cpu|clamp(0,100)|toFixed(0)|unit(%)`.
- `join(sep?)` — array → string; default separator is `", "`.
- `truncate(n, suffix?)` — `n` counts **kept characters** (matching the `slice(0, n)` reading), suffix defaults to one `…` (U+2026); a string at or below the limit is returned untouched.
- `hms(sep?)` — the counterpart of `ymd`: fixed zero-padded `HH:MM:SS` from a Date, locale-independent, separator defaults to `:`.
- `padStart`'s default pad character is `0` while `padEnd`'s is a space (deliberately not symmetric — `padStart` exists for zero-padding).
- Whitespace inside quotes is literal: `padStart(5, ' ')` pads with a space and `join(' / ')` works.

**The default locale is `<html lang>`, read when `@wcstack/state` is evaluated**, falling back to `'en'`. The four locale-dependent filters — `locale`, `date`, `time`, `datetime` — use it. Always set `<html lang>` in the markup; an explicit `bootstrapState({ locale })` still wins; a tag `Intl` does not take is reported (`#48`) and `'en'` is used. **Changing the locale later re-renders nothing** (it is a page setting, not state). Per-call overrides (`price|locale(fr-FR)`) are fixed at bind time. For pages that switch language without reloading, translations belong on a path, not in a filter (`docs/i18n-design.md`).

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
- **`onclick:` binds a method name only and cannot pass arguments** — for argument variants, define zero-argument wrapper methods (e.g. `filterAll() { this.filterBy(""); }`), or read the loop index.
- Writing `$command.<name>` on the right side emits directly: `<button data-wcs="onclick: $command.refreshList">`.
- Two `on*:` bindings of one type on one element (`onclick: a; onclick: b`) both run.

### Delegation and `#direct`

`on*:` bindings for `click`, `dblclick`, `input`, `change`, `submit`, `keydown`, `keyup`, `mousedown`, `mouseup`, `pointerdown` and `pointerup` are **delegated**: one listener per event type sits on the root the state binds — the document, a shadow root, or, inside a Light DOM mounted component, the host element — and it runs the handlers of the elements the event passed, innermost first. Other event types, and an event a custom element dispatches with `bubbles: false`, are heard on the element. Two-way bindings (`value:`, `checked:`, radio, checkbox) keep their listener on the element.

| | Delegated `on*:` | `on*#direct:` |
|---|---|---|
| `event.currentTarget` in the handler | **the root** (document, shadow root, Light DOM host) | the element |
| `#stop` on an inner binding | stops the outer delegated handlers | stops them, **and** your own `addEventListener` listeners on ancestors |
| Your code calls `stopPropagation()` on an ancestor (a modal's content keeping clicks from the overlay) | the inner handler **never runs** | it runs |
| The element is moved under another root (a dialog moved from a shadow root to `document.body`) | its handler **does not run** | it runs |

- **Do not read `event.currentTarget` in a plain `on*:` handler.** Prefer `event.target.closest("li")` or the loop index the handler receives. Lint reports a delegated-event handler that reads `currentTarget` from its event parameter as `wcs/delegated-current-target` (warning); it cannot see `stopPropagation()` in your own code or elements moved between roots.
- **Write `on*#direct:` only where the listener must sit on the element** — pointer capture (`e.currentTarget.setPointerCapture(…)`), the element's own rect, `new FormData(e.currentTarget)`, a `#stop` meant to stop your own listener on an ancestor, an ancestor that calls `stopPropagation()`, an element you move to another root. It combines with `#prevent` and `#stop` (`onclick#direct,stop:`). Inside `for:` / `if:` it is attached per row and removed with the row.
- **Order:** handlers run where the DOM puts them. An outer `#direct` handler runs on its element, before the delegated handlers inside it run at the root, so an inner delegated `#stop` cannot stop it — `<li data-wcs="onclick#direct: select">` around `<button data-wcs="onclick#stop: remove">` runs `select` and then `remove`. When an outer binding is `#direct`, make the inner `#stop` binding `#direct` too (`onclick#direct,stop: remove`).

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
<!-- Subscriber side. The right side must be $command.<name> (bare names throw #1201) -->
<wcs-fetch data-wcs="command.fetch: $command.refreshList"></wcs-fetch>
```

- Declare with `$commandTokens: string[]` → `this.$command.<name>.emit(...args)`. Arguments are forwarded verbatim to the subscribing element's method (not awaited; wait on Promises with `Promise.all(token.emit(...))`).
- One token fans out to multiple elements; subscribe order is preserved. An undeclared `$command.<name>` in markup throws `[wcs/token-undeclared]` #1302; a method the element does not declare throws `[wcs/token-misconfigured]` #1203. A subscriber that throws is reported (`#17`) and the others still run.

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

- The event-token surface fires on **every** dispatch, including a repeat of the same payload — it is the occurrence channel, so prefer it over a property binding whenever "it happened again" is the thing you care about. (On I/O nodes, properties declared `semantics: "event"` are also exempt from the same-value guard; see `io-node-catalog.md` §0.)
- **`$on` handlers are not awaited.** An async handler which rejects is caught and reported through `console.error` naming the state and the handler; it is neither propagated nor awaited, so never sequence work on the return value — let the async work write its own state slot when it settles. Synchronous throws still propagate as programmer errors.
- Declaration errors are loud: a non-array or duplicate token list (`#18`–`#21`), an `$on` entry not in `$eventTokens` (`#23`) or not a function (`#24`), an `eventToken.` name not in `$eventTokens` (`[wcs/token-undeclared]` #1301), an element with no such wcBindable property (`#1204`).
- **Where they run**: on the root state; in a **mounted component**, on the component's own bindings (`$commandTokens` / `$eventTokens` / `$on` run there); in a volume they are not run (`console.warn`). Re-attaching the root `<wcs-state>` keeps both registries; nothing fires while it is disconnected, and a re-set replaces the `$on` subscriptions.

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
- Right-side filters are an **error** (`#105`). Elements without a wcBindable declaration are an **error** (`[wcs/spread-no-bindable]` #1501) — statically caught for the built-in helper tags (`wcs-fetch-header` / `wcs-fetch-body` / `wcs-infinite-scroll` / `wcs-voice`). An empty-but-declared contract (`wcs-noise`) is legal: it expands to zero props.
- `undefined` state paths are write-skipped for the property (the element default survives). Clear by assigning `null`.
- **wc-bindable elements inside `for:` rows** work in both load orders: an output-only member (`<wcs-fetch>`'s `value` / `loading`, `<wcs-intersect>`'s `intersecting`, …) or a two-way member with `#init=element` takes its initial value from the row's own element, and a spread onto a not-yet-defined element waits for its definition (the rows render at once). In a shadow root with a scoped `CustomElementRegistry`, row elements wait on that registry. A value an element writes to its own row (`value: .`, `status: .`) updates that row only.

## 10. `$watch` — headless change subscription

`$renderedCallback` is binding-driven: a value nothing renders is invisible to it. **`$watch` fires on state changes whether or not the path has a DOM binding.**

```javascript
export default {
  isLoading: false,
  items: [],
  $listKeys: { items: "id" },          // optional: a keyed refetch fires only the changed fields, with a real prev
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
- **`prev` comes only with a primitive write** (for a getter: its previous evaluation) — it is `undefined` when the *new* value is a reference type, for `$postUpdate`, and for a row that entered the list.
- **No firing condition of its own**: it fires for whatever landed in the batch — a write of its path or of an object above it in the same row, a change that reached its getter, a row that entered its list. Equal primitive writes are already dropped before enqueue (effectively change-only firing), but a `semantics: "event"` occurrence write is *not* dropped and fires with `cur === prev`.
- **Rows are headless**: a wildcard row watch needs neither a `for` binding nor `$listKeys` — the watch keeps its lists synced itself. A whole-array assignment fires only the rows that **entered** the list (`prev` undefined); a row kept by identity did not change and does not fire; an in-place mutation announced with the same array, a copy, or `$postUpdate("items")` fires nothing (getters still read the new values). After a `fetch().json()` refresh every row is new, so every row fires — declare `$listKeys` to turn that into per-field writes that fire only what changed, with a real `prev`.
- **Watching a getter makes it eager** — wildcard getters included: evaluated at connect and again at the end of every batch touching its dependencies (`prev` = previous evaluation). A change that reaches the getter fires the watch whether or not its value changed (no condition of its own); a wildcard getter fires per row the change reached. You pay that evaluation per batch, and exceptions inside the getter surface through the watch. A row getter on a row a list assignment or re-sort kept fires only when its value changed — unless the same batch changed something it read outside its row (`now`, `items.length`, a root getter over them).
- **A numeric-index key** (`"items.0.v"`) fires only when the value at that index changes.
- **Ordering** at the end of a drain is fixed: bindings applied → `$renderedCallback` → binding failures (`$errorCallback`, or the console) → `$watch` handlers (declaration order; ascending indexes between rows of one path) → `$stream` restarts. A `<wcs-view-transition>` accepting the `state` participant puts binding application — and with it `$renderedCallback` — on a **frame**, while `$watch` and the `$stream` restart stay on the original microtask, so the order becomes `$watch` → `$stream` restart → `$renderedCallback` while that tag is present (`for="router"` on the tag keeps state's timing untouched).

Key rules (each of these fails silently or surprisingly if ignored):

1. **Scope-relative paths only, declared on the root state** — a key is a path in the root's vocabulary (`"cart.total"` for a volume's value). A volume declaring `$watch` is not grafted; a mounted component's `$watch` is not run (`[wcs/mount-dollar-declaration]` warning).
2. **A key cannot start with `$`** — so `$streamStatus.<name>` / `$streamError.<name>` cannot be watched directly. The idiom: mirror through a one-line non-`$` getter (`get streamStatus() { return this["$streamStatus.pageResult"]; }`) and watch that — the eager-getter rule is exactly what makes it work unrendered. The accumulation itself belongs in a `$watch` on the stream's value that writes a key you own (§15).
3. **Intermediate values are not observable** — a batch `a → b → c` fires once with `cur = c`, `prev = a` (same contract as binding updates).
4. **Handler exceptions are isolated** — reported to the console (and the devtools timeline as `state:watch-error`), remaining watches and stream restarts still run. This differs from `$connectedCallback`/`$renderedCallback`, which fail loudly.
5. **Write chains are bounded** — a handler's writes form a new batch; a handler fired more than 32 links deep (counted per write: only a handler's write that triggers another handler extends the chain; a `$stream` restart counts like a handler) is cut with a console error (`state:watch-chain-limit` in devtools). Only the handlers and restarts those writes fired are skipped; the batch's other handlers still run. Nothing is rolled back. A loop that goes back through a **render** is the render chain limit's job (§11).
6. **SSR never runs watches** — otherwise handler side effects would execute on both server and client.
7. A re-set (`setInitialState`) is not a write: no handler fires; the new state's declarations arm themselves.

Tooling knows the declaration: `@wcstack/lint` and the VS Code extension validate it — `wcs/watch-declaration-invalid` (error: `@` key, `$`-prefixed key, empty path segment, non-function handler, a whole `$watch` value that is definitely not an object) and `wcs/watch-path-missing` (warning: the key does not exist in the state definition — unlike a binding typo, which visibly fails to render, a `$watch` typo silently never fires). The runtime's own declaration errors carry the same code, and the diagnostics feature warns once for a key that provably does not resolve. The devtools coverage tab joins `state:watch-fired` against the declared keys (*fired ×N* / *never*).

## 11. Other Features

- **Lifecycle**: On the state object: `$connectedCallback` (async allowed, awaited, runs on every reconnection), `$disconnectedCallback` (sync only), `$renderedCallback(paths, indexesListByPath)` (async allowed, not awaited), `$errorCallback(error, info)` (next bullet). On the Web Component side: `async $stateReadyCallback(stateProp)`. **Initialization order**: load the state (on the split auto entry, also the features its `$features` names) → build every binding under the root and apply its initial value, synchronously → resolve `initializePromise` and `getBindingsReady()` → run `$connectedCallback` → resolve `connectedCallbackPromise`. So **`$connectedCallback` may emit a command or read a defined element at once**; an element whose class is not defined yet gets its property / `command.` / `eventToken.` / spread bindings when it is defined (`getBindingsReady()` does not wait for those).
- **`$errorCallback(error, info)` is the in-page error boundary for bindings.** A binding whose application throws (a path getter / filter threw, a structural directive failed) is isolated — the rest of the batch applies, nothing is rolled back — and reported with `console.error` unless the **root** state declares this hook; then the report comes to it instead. `info` = `{ path, bindingType, node }` (`path` as written in `data-wcs`, wildcards intact; `node` is `null` for a list that no `for:` renders); `this` is the writable proxy, so the canonical shape is ``this.loadError = `${path}: ${error.message}` `` and a plain `textContent:` bind. Runs after `$renderedCallback`, not awaited, own exceptions isolated; DevTools still gets `state:binding-apply-error`. A **mounted component**'s `$errorCallback` receives the failures of the component's own bindings; a **volume**'s is not run (`console.warn`). Does **not** cover `$watch` handler failures or exceptions thrown by `$connectedCallback` / `$renderedCallback`.
- **`$renderedCallback` is binding-driven, not write-driven**: `paths` lists only the paths whose **live DOM bindings** were applied in that drain. A state write with no binding never calls it and never appears in `paths`. So it cannot be used as a headless watcher — that job belongs to `$watch` (§10).
- **An element that fails to initialize reports once and rejects.** `console.error` names the element and where its state comes from, then the error: `<wcs-state src="./state.js"> failed to initialize.` (`#49`; it names `state=`, `src=`, `mount=` and `bind-component=` when present). Causes: a throwing or removed `$` declaration (`$scan` `#1`, `$streams` `#1601`, …), an invalid `$behavior` (`#44`) or `$features` (`#46`), a source that cannot load (`#13`, `#16`, a CSP block `#42` / `#43`), a DCC or `bind-component` setup error, a second root `<wcs-state>` (`#47`, refused alone), and — 4.0 preview behaviour, still under review — a page-level markup error (§3). Contract:
  - `connectedCallbackPromise` **rejects** with the error (test the error itself — its type or your own class — never the message text);
  - `initializePromise` still resolves, so one element's mistake does not hold up the rest of the page;
  - `getBindingsReady(root)` rejects only when **every** `<wcs-state>` on that root failed before building its bindings (it resolves at once for a root with none);
  - `setInitialState()` on a failed element throws `this <wcs-state> failed to initialize; create a new one` (`#14`) — replace the element;
  - a `$connectedCallback` that throws or rejects **after** the bindings are built is `<wcs-state …> $connectedCallback failed.` (`#50`): `connectedCallbackPromise` rejects, but `getBindingsReady()` resolves (the page is bound) and `setInitialState()` stays open;
  - a volume never rejects (a refused volume resolves); a mounted component's `<wcs-state bind-component>` rejects when it fails to mount, when the root it is wired to failed (`<tag>.state will not mount: the root state failed to initialize.`), and when a second one connects in one component;
  - `@wcstack/server`'s `renderToString()` and `@wcstack/testing`'s `mount()` wait for every `connectedCallbackPromise` and reject with the cause. Detaching an element while its source is still loading is an interruption, not a failure.
- **A re-set re-renders the page.** `setInitialState(next)` on an **initialized** element replaces the whole state and re-applies every established binding to the new state *before it returns* — scalars, getters, row getters, `for` and `if` alike. A binding that cannot be read from the new state is reported as a **failed apply** (`console.error`, or the new state's `$errorCallback`). A re-set is **not a write**: no `$watch` handler, no `$stream` restart and no `$renderedCallback` (the new declarations arm themselves). Lists are matched by **array identity** — pass a new array when a list changed. **It may not change `$behavior`** (`a re-set state may not change $behavior: create the element again.`, `#45`); a re-set state without `$behavior` is compared with the defaults, so repeat the declaration. It throws on a tree with grafted volumes or mounted components and on a loaded `mount=` volume element. Known 4.0 preview limitation: after a re-set, `Object.keys(this)`, `in`, `delete` and `JSON.stringify(this)` still see the old state.
- **$stream**: `$stream: { name: { args?, source, fold?, initial? } }` — source is `(args, signal) => AsyncIterable|ReadableStream|Promise<same>`, honoring AbortSignal is mandatory, `initial` is required when `fold` is specified. status/error: `$streamStatus.<name>` (`"idle"|"active"|"done"|"error"`) / `$streamError.<name>` — read-only; a getter reading them depends on them. args are synchronous, cannot read wildcards, self-dependency forbidden; writing a dependency several times in one batch restarts once. An entry name that collides with a method / getter / setter on the state raises. Infinite streams require a bounded fold. **Bridging callback APIs (EventSource / WebSocket / DOM events)**: wrap in a `ReadableStream` (enqueue in `start`, release the resource in `cancel()`); the runtime cancels the reader on restart/dispose, so the AbortSignal contract is satisfied automatically. Hand-written async generators must watch `signal` themselves — a generator parked on `await` cannot be force-released from outside. A restart aborts the running run, drops its later chunks and resets the value to `initial`. **Observing a stream without rendering it**: `$watch` its value path — or, for status-driven work, mirror `$streamStatus.<name>` through a non-`$` getter and watch that (§10 rule 2). Root state only (a volume declaring it is not grafted; a mounted component's is not run). **Accumulating across runs**: a stream's `fold` resets to `initial` on every restart — fold the stream's value from a `$watch` on the stream name into a key you own (§15).
- **Runtime messages**: `[@wcstack/state] [wcs/<code>] <sentence>` with the `diagnostics` feature (`@wcstack/state`, `/auto`, `/parser`; `/core` after `installFeatures([diagnostics])`; the split auto entry with `features="diagnostics"`), `[@wcstack/state] [wcs/<code>] #<number> <values>` without it. The code comes from the number's hundreds (1xx `binding-syntax`, 2xx `template-syntax`, 3xx `binding-path-missing`, 4xx `binding-type-expectation`, 5xx `filter-unknown`, 6xx `filter-arity`, …; 1–50 have none); a number keeps its meaning across versions; the wcstack repo's `docs/state-errors.md` lists them. With the feature, a thrown message can add a did-you-mean (edit distance ≤ 2, the lint's criterion), the replacement for a removed 3.x name, a fix, and `Validate statically: npx @wcstack/lint <file>.` for the codes lint detects. Messages without a number (the feature barriers, volumes, components, SSR, `$watch` / `$stream`) are printed in full either way.
- **Unresolved wired paths warn at binding time** (diagnostics feature): a bound path that provably does not resolve (`user.nmae`) gets one `console.warn` with `wcs/binding-path-missing` + did-you-mean; reading a missing top-level key throws `[wcs/binding-path-missing]` (#301). The check **under-approximates**: `null`/`undefined` parents, rows of an empty list, sub-properties of a getter's return, mapped `bind-component` child scopes, and `$` namespaces all stay silent — **no warning proves nothing**; run lint for the exhaustive check.
- **Limits — report and continue; values and DOM are never rolled back.** A failing binding is confined to that binding (the rest of the batch, `$renderedCallback`, `$watch` and `$stream` restarts still run). Watch chains are cut at 32 links (§10). One update that does not settle within 32 passes reports `updates did not settle after 32 passes` (`#11`; devtools `state:render-chain-limit` with `maxDepth: 32`). **A write chain made while rendering is cut off after 100 drains**: some writes happen while bindings are applied — a wc-bindable element in a new `for:` row hands its initial value to state, a `$renderedCallback` writes — and each starts a drain that renders again; if every render writes something new, the 101st drain's bindings are skipped (its values stay in state) with one `render chain depth limit exceeded (100 drains that rendering itself started); bindings for this batch were not applied.` (`#41`; DevTools `state:render-chain-limit`), and the next write from outside renders normally. Drains chained by microtasks count — an element emitting in a microtask and an async `$renderedCallback` are cut too, and a `$stream` restart's writes count toward the chain; a pause between tasks ends it, so a write from a later task (a user action, a timer, an I/O event) starts afresh.
- **The binding grammar is machine-readable** — tooling-facing, never needed in app code: `@wcstack/state/manifest` (and `dist/wcs-manifest.json`) carries the vocabulary (modifiers, `$1..$N`, every binding type, the reserved `$` keys including `$behavior` / `$features`, `behaviorOptions`, `features`), and `@wcstack/state/parser` exposes the canonical binding parser (DOM-free and pure; invalid syntax throws) that the lint CLI, the VS Code extension and devtools consume.
- **Configuration — notation in `bootstrapState()`, behaviour in `$behavior`.**
  - `bootstrapState({ locale, bindAttributeName, tagNames: { state, ssr }, commentForPrefix, commentIfPrefix, commentElseIfPrefix, commentElsePrefix, enableContractAnalyzer })` — how the page spells the markup (the same on the server), the locale default, and the dev-time `analyzeContract()`. It checks every option before applying any and **throws** (`bootstrapState: "<key>" is not one of its options, or not of the option's type.`, `#44`) on an option it does not have (`enableMustache` / `sameValueGuard` / `enableDirectionalInitialSync` add `4.0 moved it to the state's $behavior.`; `debug` / `commentTextPrefix` / `enablePropagationContext` are gone), on a value whose type differs from the default (`null`, an array for an object), on an unknown `tagNames` name, and on a non-string tag name. An `undefined` value is skipped (`bootstrapState({ locale: maybeLocale })`). `/auto` passes none. `getConfig()` reads it.
  - **`$behavior: { enableMustache, sameValueGuard, enableDirectionalInitialSync }`** in the state — three booleans, each `true` by default: `{{ }}` text, the primitive same-value guard, direction-aware initial sync (needed by `#init=` / `#sync=`). It applies to the tree of the `<wcs-state>` that declares it, its volumes included; **each root state that needs it declares its own** — the page's root, a root `<wcs-state>` in a shadow root, a mounted component, a DCC — nothing is inherited from a host, and a volume cannot declare it. Unknown key or non-boolean → `#44`; not an object → `#44` (`state: "$behavior" …`); changing it on a re-set → `#45`. It works on `/auto` pages and in JSON states, and the server reads the same state under SSR. Lint: `wcs/behavior-invalid`.
  - **`$features`** — the add-ons a state needs (§1).
- **TypeScript**: Wrap with `defineState({...})` for `this` type completion (zero runtime cost; a bundle that imports only `defineState` or the types tree-shakes to almost nothing). Keys containing `**` (§14) are typed `any` through a pattern index signature — ordinary dot paths keep their resolved types, and the VS Code extension's preamble declares the same signature so the editor, `wcs-tsc` and `tsc` agree. `@wcstack/state` also exports the type `IStateElement`.
- **SSR**: `<wcs-state enable-ssr>` + `renderToString()` from `@wcstack/server` (`RenderOptions.timeoutMs`, 30 000 ms by default, `0` disables — keep it finite and ≤ 2 147 483 647). The server renders the page and writes `<wcs-ssr version>` (the state's data as JSON, plus the templates); the client **adopts** the server's rows and branches where they are (a custom element in them is connected once, never disconnected and re-connected), applies every binding, nested `for` / `if` included, and does not run `$connectedCallback` (the server ran it). Rules:
  - **Deploy `@wcstack/server` and the client at the same major.minor.** A snapshot of another major.minor — a 3.x server's output, say — is discarded with `<wcs-ssr version="3.5.0"> does not match 4.0.0: its snapshot is discarded, and the page renders on the client from its own state.`: the state loads from its own source, `$connectedCallback` runs on the client, and the page works, but the server's work is redone (output of a 3.x server up to 3.5.2 also loses the filters of page-level text bindings). A 4.0 server with a 3.x client is not supported. When you switch, purge HTML cached from the old version, and do not post-process the output based on its markers.
  - **Keep the comments in the output.** Text bindings and the row / branch markers are comments: removing them (html-minifier's `removeComments` and the like) breaks hydration, and `{{ }}` inside values may be read as bindings on the client.
  - **The snapshot is JSON**: `Date`, `Set`, `Map` and class instances do not survive it. Keep JSON values in SSR state and derive the rest in getters (`get created() { return new Date(this.createdIso); }`).
  - `outerHTML:` / `outerText:` are applied on the client only (the value is not in the HTML search engines and no-JS views see); children that a Light DOM custom element bound at page level renders from a value are rendered by the client; children you wrote stay in the output.
  - A server row that no longer matches its template is rendered again in its place (bound after insertion, unlike a client render); rows and branches the client does not render are removed once the page is bound. `<tr>` rows of a `<table>` written without `<tbody>` stay in the `<tbody>` the parser adds.
  - SSR never runs `$watch`, and streams stay at their initial value on the server.

## 12. Component mechanisms — DCC vs `bind-component` (they are exclusive)

Two mechanisms give a custom element its own state — pick one per component; combining them is an error, and putting `<wcs-state bind-component>` inside a `data-wc-definition` host is a misconfiguration (DCC state belongs to the template and is loaded per instance).

| | DCC (`data-wc-definition`) | `bind-component` |
|---|---|---|
| How the element is defined | HTML only (Declarative Shadow DOM) | your own `class extends HTMLElement` |
| Where the state lives | inline `<script type="module">` in the template, loaded per instance | a property on the component instance (`this.state`) |
| `static wcBindable` | generated from `$bindables` / `$commands` | **none** — it is not a wc-bindable producer |
| Bind a value from the parent | `count: parentCount` (two-way, with change events) | `state.msg: user.name` (path mapping) |
| Invoke a method from the parent | `command.bumpBy: $command.bump` | not possible — expose it on the class and call it yourself |
| Spread (`...: obj`) | works | does not work (needs a `wcBindable` declaration) |
| Read/write from inside | `this.count` on the element | `this.state.msg` |

Rule of thumb: **no JavaScript class → DCC; already writing a class → `bind-component`.** That `bind-component` stays outside the wc-bindable protocol is deliberate — it wires by *path*, not by a declared property surface, and losing spread and command tokens *into* it is the consequence. A DCC or a mounted component that needs a behaviour switch declares its own `$behavior` (nothing is inherited from the host).

### DCC: `$bindables` and `$commands`

```javascript
export default {
  count: 0,
  bumpBy(step) { this.count += step; },
  $bindables: ["count"],     // observable properties (+ my-counter:count-changed events)
  $commands: ["bumpBy"],     // invocable commands
};
```

```html
<button data-wcs="onclick: fire">bump</button>
<my-counter data-wcs="command.bumpBy: $command.bump"></my-counter>
<!-- parent state: $commandTokens: ["bump"], fire() { this.$command.bump.emit(3); } -->
```

- Positional arguments pass through verbatim, so `emit(3)` calls the component state's `bumpBy(3)`.
- Every `commands` entry is declared `async: true` — a DCC method chains onto the inner `<wcs-state>`'s initialization, so the return value is a Promise even when the state method is synchronous.
- Both declarations are validated at definition time with the same strictness as `$commandTokens`. Errors: not an array; a non-string or empty entry; an entry starting with `$`; a **duplicate entry**; a name that does not exist on the state (own properties and the prototype chain are both searched; `$stream` names count as existing); a method listed in `$bindables`, or a value property listed in `$commands`. A DCC definition that fails rejects its `connectedCallbackPromise`.
- Other DCC state keys: `$connectedCallback` / `$disconnectedCallback` / `$renderedCallback` run per instance.

### `bind-component`: whole-object mount — `state: path` (the default)

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

- `state: user` mounts the component's root at tree path `user`. Reads, writes (`value: name`, `this.state.name = ...`), getters and `for:` all resolve against the tree; host-side `this.user = {...}` and `this["user.name"] = ...` both reach the component. `state: .` outside any `for:` is refused (`[wcs/wildcard-rank]` #1402).
- **Partial mounts coexist**: `state: user; state.theme: theme` — longest prefix wins, so `theme.mode` inside reads the tree's `theme.mode`. Duplicate inner paths throw at build. Only a one-segment entry marks a key mapped (`state.a.b: outer.b` leaves the rest of `a` private). A component's own **method** wins over a partial mount of the same name (a hidden entry is reported once as `[wcs/mount-own-key-shadow]`).
- **Own keys are private (rule R1)**: a data key the component declares itself (`state = { mode: "view" }`) belongs to the element and is never written to the tree. If it hides a key existing at the mount point, the runtime warns once (`wcs/mount-own-key-shadow`) — remove the default to read the tree, or rename to keep it private. Private-key updates never reach the root's `$renderedCallback`. **An explicit partial mount wins over the component's own key** — a default for a *mapped* key (`state = { message: "" }` next to `state.message: ...`) is unused.
- **`#ro` on a mount**: `state#ro: user` or `state.title#ro: doc.title` lets the component read but not write that entry — `element.state.title = …`, `this.title = …` in a method and `$setAll` / `$resolve` writes throw `[wcs/mount-readonly]`, and a two-way binding inside the component does not write back. The host still writes the path.
- **Mounting an array as the root is not supported** (`state: rows` with `for` over it inside) — mount the row (`state: .`) or the object holding the array (`state: group` + `for: children` inside).
- **No wildcard-terminal accessor over a mounted list**: `get "tags.*"()` on a mounted component raises — put the getter on the host tree, or over the component's own private array.
- `$getAll` / `$setAll` / `$resolve` / `$postUpdate` / `$eq*` / `$dependOn` on `element.state` (and on `this` inside getters and methods) speak the component's own vocabulary: paths are translated onto the mount and the host row's indexes are prepended automatically. A class-based component keeps its prototype accessors (a getter wins inside the component over a tree key of the same name).
- **The component's own code re-renders what it writes**: a method or setter body that writes a private key (`toggle() { this.mode = this.mode === "view" ? "edit" : "view"; }`) goes through the host's write path, also after an `await`. A method taken from `element.state` (`card.state.toggle()`) runs as it does from an event binding — writes re-render, a row mount's call lands on its own row, a synchronous method returns its value and an async one its Promise.
- **Components in a host `for:` row read and write their own row**, keep one set of private keys **per element** (an element write of the host row — `this["users.1"] = obj` — keeps the component element and its private keys), and their `$connectedCallback` / `$disconnectedCallback` read the element's current row. When the row is removed, `$disconnectedCallback` can still read and write the component's own keys (clear the timer id you kept in `this.tid`); reading the row's keys throws `The host row of <x-row> was removed.`, as does a method that resumes after an `await` once its row has left the list.
- **One mount scope per component**: a second `<wcs-state bind-component>` connected in one component rejects (`<tag> already has a connected <wcs-state bind-component="state">.`). A `<wcs-state bind-component>` with `state` / `src` / `json` or an inline script is refused (lint `wcs/bind-component-source`) — the host provides its data.
- **Replacing the component's `<wcs-state bind-component>`** while nodes the old one bound are still there: the new element takes the scope over, those bindings stay, and nodes with bindings added beside them are not bound (a `console.warn` says so). Render the content again with the new element for a fresh bind.

**Declarations in a mounted component (4.0):**

| Declared in a mounted component | 4.0 |
|---|---|
| `$listKeys` | runs on the component's own lists |
| `$commandTokens`, `$eventTokens`, `$on` | run, on the component's own bindings |
| `$errorCallback` | receives the failures of the component's own bindings |
| `$watch`, `$stream`, `$renderedCallback` | not run — one-time `[wcs/mount-dollar-declaration] <tag>: … is not run in a mounted component — declare it on the root state.` |
| `$recursion` | **throws** the same code |

**Exported getters — a component's derived values are readable at its mount point.** A read of a key the tree does **not** have is answered by the getter of the component mounted there; a key the tree *does* have wins (and warns once, `wcs/mount-export-shadowed`); **private data keys and methods are never visible** — R1 still holds, only accessors cross the boundary. With `<user-card data-wcs="state: user">` declaring `get display()`, the host binds `textContent: user.display`.

- **Row mounts export per row**: `$getAll("users.*.display")` on the host and `text: .display` inside the same `for` both read each row component's getter, and dependencies flow through — when `user.name` changes, everything that read `user.display` re-renders.
- **Only accessors whose exported path has the mount point's wildcard count are exported.** `get "children.*.label"()` works inside the component but is *not* exported — mount a component on each child row and give it `get label()`.
- **The parent evaluates before the child registers**, so a host expression's first read may see `undefined` and converges once the component mounts — write derived expressions defensively (`(x ?? 0)`). Binding-sourced missing-path warnings are deferred one macrotask for the same reason; with an autoloader an initial warning can still appear before the component registers even though the binding resolves.
- **Writing** to an exported key from outside runs the accessor's setter, or **throws** when it only has a getter (`#2`) — the tree never grows a key that would hide the getter. `in` does not see exported keys.
- Two components exporting the same key on one instance is a configuration error (`wcs/mount-export-ambiguous`).
- **Self-recursive components become expressible**: a `<tree-node>` that renders `<template data-wcs="for: children"><tree-node data-wcs="state: ."></tree-node></template>` inside itself can define `get total() { return this.value + this.$getAll("children.*.total").reduce((a, b) => a + (b ?? 0), 0); }` — each level's formula closes over one level and the ledger resolves the recursion. DevTools lists exported keys per mount record under `exports` in the Overlays section.

### `bind-component`: rendering the host's list inside the component

`<wcs-state bind-component="state">` goes inside the shadowRoot (or, for a Light DOM component, as a direct child); the host writes `data-wcs="state.message: user.name"`. An array can be bound across the boundary and iterated **inside** the component:

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

The outer state stays the source of truth: replacing `rows` wholesale, or writing a single row field (`rows.0.name`), both reach the component's rows, and writing `items.*.name` back from inside reaches the host's `rows`. Components stack to arbitrary depth: the base list index composes across every boundary, and an intermediate component that only passes the array through still delivers a row-field write to the rows at the bottom. Loop indexes stay **scope-local**: `$1`, event-handler indexes, `$renderedCallback` and `$getAll` all report the position within the component's own scope.

### `bind-component` in Light DOM

A Light DOM component is written exactly like the Shadow one — `<wcs-state bind-component="state"></wcs-state>` as a direct child. Scope is decided by position in the DOM, so the same Light DOM component can sit on every row of a `for`.

- **The host must wire it.** A plain, unwired Light DOM `bind-component` fails loudly with the fix — an independent tree cannot share the parent's root: add `attachShadow`, or mount it from the host (`state: user` / `state.message: user.name`).
- Inside a Light DOM mounted component, delegated `on*:` handlers run at the **host element** (`event.currentTarget` is the host — §8).
- **`getBindingsReady(root)` covers mounted scopes** once the mount record resolves. Await the component's own `<wcs-state>` when you specifically need its contents rendered.

### Your own `static wcBindable` element: what the two-way binding writes back

A third option is a hand-written class that declares `static wcBindable` itself (it then gets spread, command tokens and event tokens like an I/O node). The one rule that is easy to miss: when the element dispatches `properties[].event`, the value written to state is **`getter(event)`**, and with no `getter` the wc-bindable default is **`(e) => e.detail` — the whole `detail`, as-is**. The declared property is *not* read off the element at that moment (only the initial sync reads it). Dispatching `detail: { value: 7 }` without a `getter` therefore writes the object `{ value: 7 }` to state and the write-back becomes `NaN`. `@wcstack/lint` cannot see it (the payload shape is not static); the runtime warns once per element and property (`wcs/default-getter-mismatch`) for the two shapes it can tell apart at the event — a `detail` that is `undefined` while the element property has a value, and a `detail` object carrying a `<propName>` key while the property is not an object. Any other mismatch still goes through unnoticed, and occurrence properties (`semantics: "event"`) are exempt. Use one of the two conforming shapes:

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

**Attributes are yours to reflect.** State writes an input's property only. An `inputs` entry's `attribute` (`{ name: "active", attribute: "active" }`) just names the markup attribute for tooling — state never writes it. If CSS, `attributeChangedCallback` or DevTools should see the value on the attribute, reflect it in the setter with the encoding your element reads: `set active(v) { this.toggleAttribute("active", Boolean(v)); }` for a flag read with `hasAttribute`, `this.setAttribute("limiter", v ? "on" : "off")` for one that is on unless `"off"`. An element that only listens to `attributeChangedCallback` and has no setter will not see state's writes.

Keep `element.value` and the extracted event value the same logical state (initial sync reads the property, later updates read the event). Do not expect the default to change: it is normative for every wc-bindable adapter, and DCC's `$bindables` reading `e.target[name]` is a producer-side `getter` choice, not a different default. A custom element that dispatches a delegated event type (`click`, `input`, …) with `bubbles: false` is heard on the element itself.

## 13. Testing the page headlessly

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
fire(app.root.querySelector("button"), "click");        // what a user does (bubbles to the delegated root listener)
await settle();
app.unmount();
```

`mount(html, { root: "shadow", bootstrap: [async () => (await import("@wcstack/router")).bootstrapRouter()] })` scopes bindings to a fresh shadow root and registers additional packages. The bare recipe (no `@wcstack/testing`): `URL.createObjectURL = undefined` in setup (Node cannot import `blob:` URLs, so this reroutes inline `<script type="module">` state through the `data:` loader — without it an inline state never finishes loading), and `await stateEl.connectedCallbackPromise` then `await getBindingsReady(document)` before asserting. Writes go through `stateEl.createStateAsync("writable", async (state) => {...})`. Dispatch synthetic events with `bubbles: true` (`new Event("input", { bubbles: true })`; `fire()` and `el.click()` do) — a non-bubbling `click` / `input` never reaches a delegated `on*:` handler on the root (two-way bindings listen on the element itself).

- **A state that fails to initialize fails the test**: `connectedCallbackPromise` rejects with the error, so `mount()`, `renderToString()` and `getBindingsReady(root)` reject with the cause (§11).
- **Snapshot**: `expect(await renderToString(html)).toMatchSnapshot()` — `renderToString` from `@wcstack/server`.
- **Bare Node (no vitest)**: `const restore = installGlobals(new Window({ url: "http://localhost/" }))` from `@wcstack/server`, then **dynamic-import `@wcstack/state` after it** (a static import at the top of the file registers elements happy-dom cannot construct), run the same steps, `restore()`.
- **Blind spots that still need one browser e2e** (Playwright): happy-dom replaces nodes on a late `customElements.define`, and its event timing differs from real browsers.

## 14. Recursive paths — `$recursion` and `**`

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

**`**` is authoring notation only — it never reaches the engine.** Reading a concrete path (`nodes.*.children.*.total`) materializes the getter for *that* depth on demand, and everything downstream — the dependency graph, `$1`…`$n`, `$resolve`, the list diff — still sees an ordinary fixed-arity path. On `/core` install `features/recursion`.

### Declaring the recursion point

`$recursion` maps one **anchor** to the **repeating sub-path** one level down. Both name the *element* of a list: a fixed property chain ending in `.*`, never the list itself, and never carrying an index segment (`"nodes.0.items.*"` is refused — the recursion is over the shape of the tree, not one row).

```javascript
$recursion: { "nodes.*": "children.*" }     // nodes[i].children[j].children[k]…
$recursion: { "data.tree.*": "kids.*" }     // a deeper anchor is fine
$recursion: { "nodes.*": "nodes.*" }        // self-similar spelling is fine too
```

The declaration is what gives `**` a meaning at all — with no `$recursion`, `**` is not a path character (`wcs/recursion-unsupported`), so it can never quietly become a descendant search. **Exactly one self-recursive anchor per state**, and it is **root-only**: a volume (`mount=`) declaring `$recursion` or a `**` getter is not grafted, and a mounted `bind-component` scope declaring `$recursion` throws `[wcs/mount-dollar-declaration]`.

### What `**` means where — bound vs union

| Where `**` appears | What it means |
|---|---|
| A getter key — `get "nodes.**.total"()` | Bound to the depth being evaluated |
| A path read inside that getter — `this["nodes.**.value"]` | Bound to the same depth |
| `$getAll(path)`, indexes **omitted** | Bound to that depth; only the wildcards *after* `**` expand |
| `$getAll(path, [])`, **explicit** | **Union of every depth** — depth-first, pre-order, ascending index |
| `$getAll(path, [i, …])` | Refused: a prefix cannot say which depth it applies to (`wcs/recursion-getall-form`) |
| `$setAll(path, [], value)` | Broadcast to every depth, same order |
| `$resolve` / `$postUpdate` / `$dependOn`, `$watch` and `$listKeys` keys, `data-wcs` markup, direct assignment | Refused (`wcs/recursion-unsupported`) |

The **bound** forms need a depth to bind to, so they resolve only **inside** a recursive getter, an ordinary row getter under the anchor, or an event handler bound to such a row. Read `this["nodes.**.value"]` at the top level and you get `wcs/recursion-context`, not a guess. The depth comes from the **innermost evaluation frame only**: a plain getter that a recursive getter calls has no row of its own and gets `wcs/recursion-context` too — read `**` in the recursive getter and pass the value on. The **union** form needs no depth and can be read anywhere.

### Aggregating without counting grandchildren twice

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

`$setAll` takes `**` in exactly one form — `[]` plus a plain value — and returns the number of addresses written. Every other form is refused *before* the walk writes anything:

| Refused form | Why |
|---|---|
| a non-empty prefix | A prefix cannot say which depth it applies to (`wcs/recursion-setall-form`) |
| omitted indexes | The write API takes no evaluation context, so there is no depth to bind — `[]` is mandatory |
| a mapper function | `(current, ...indexes)` has a different arity at every depth |
| `{ spread: true }` | Handing a flat array to a tree needs the author to know the walk order |
| the structure itself — `nodes.**`, `.children`, `.children.*`, `.children.length`, `nodes.**.children.0`, and (multi-segment repeat) the object on the way to the list | Writing it invalidates the child addresses this very write already resolved (`wcs/recursion-structural-write`) |
| `nodes.**.total` or a path inside its value | A recursive getter has no setter (`wcs/recursion-readonly`) |

**The read-only rule does not depend on spelling `**`.** A recursive getter's concrete expansions — `nodes.*.total`, `nodes.*.children.*.total`, `nodes.1.total` — are refused at the write entry too, whether the write is a fixed-arity `$setAll`, a `$resolve(path, indexes, value)` or a direct assignment.

### The input has to be a tree

The walk refuses reaching the **same array instance** twice: from an ancestor it is `wcs/recursion-cycle`, otherwise two nodes share one child list (`wcs/recursion-shared-list`). Give every node its own `children` array — sharing an *empty* one is fine. The ceiling is **128 wildcard levels** (`wcs/recursion-depth-exceeded`); it trips before the getter stack's own 128-frame limit (`wcs/getter-depth-exceeded`), so a deep tree is reported as deep instead of accused of a cycle. Nothing is truncated. Replacing row objects while keeping their `children` arrays (`this.nodes = this.nodes.map(n => ({ ...n }))`) keeps the child rows and their aggregates live.

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

Two traps, both quiet:

- **The component's `state` must not declare the keys it is mounted over.** Methods and unrelated private keys are fine; a `node` / `children` of its own is not — an own key is private (rule R1, §12), so it hides the mount and the child renders its own default and never descends. The runtime names this one: `wcs/mount-own-key-shadow`.
- **Build the shadow in `connectedCallback`, not the constructor.** Assigning `innerHTML` in the constructor upgrades the elements inside `<template>` on implementations that do not keep template content inert, and a self-referential element then recurses forever in its own constructor.

Fixed depths need none of this: expanded paths are ordinary paths, so nested `for` templates bind `nodes.*.total` like anything else. Working demo: `packages/state/examples/recursive-tree/`.

### Not in this version (each is a diagnostic, never a reinterpretation)

More than one anchor, mutual recursion, a wildcard mid-anchor, a second `**` in one path; recursive **setters**; a `**` getter whose suffix names the structure (`get "nodes.**.children"()`, `.children.*`, `.children.length`); two `**` getters expanding to the same concrete path; a concrete getter with the same name as an expansion (`get "nodes.*.children.*.total"()`); `get "nodes.**"` (that names the node itself); a recursive `<template>`, a `$depth` variable, and a public `maxDepth` option.

**Diagnostics.** `wcs-validate` and the VS Code extension report every statically decidable form under the same codes and stay silent where the declaration cannot be read statically (an identifier reference, a spread, a computed key, a `class` state). **Runtime-only**: `wcs/recursion-context`, `wcs/recursion-shared-list`, `wcs/recursion-cycle`, `wcs/recursion-depth-exceeded`, plus `wcs/getter-depth-exceeded`.

## 15. Accumulation over time — a key you own, folded in `$watch` / `$on`

A getter derives from *current* values; a `$stream` `fold` accumulates *within one run* and resets to `initial` on every restart. A value that has to outlive both — a feed across page runs, a log across events — is **an ordinary state key you seed and write from a handler**: a `$watch` handler for the landings of a state path, an `$on` handler for the events of a token. (There is no `$scan`; rewriting a 3.x one: §16.)

```javascript
export default {
  page: 1,
  pageSize: 20,
  host: "a.example",
  feed: { items: [], pages: [] },              // seeded, owned by you
  log: [],
  $eventTokens: ["message"],
  $stream: { pageResult: { args: (s) => ({ page: s.page, pageSize: s.pageSize }), source: loadPage } },
  // loadPage(args, signal): your async generator, yielding { kind: "success", page, items } per page
  $watch: {
    pageResult(chunk) {                        // one call per landing of the stream's value
      if (chunk?.kind !== "success" || this.feed.pages.includes(chunk.page)) return;   // progress chunks / page key
      this.feed = { items: this.feed.items.concat(chunk.items), pages: [...this.feed.pages, chunk.page] };
    },
    host() { this.log = []; },                 // a reset: write the seed back
  },
  $on: {
    message: (state, event) => { state.log = [...state.log.slice(-49), event.detail]; },   // bounded
  },
};
```
```html
<template data-wcs="for: feed.items"><li data-wcs="textContent: .name"></li></template>
<wcs-sse url="/events" data-wcs="eventToken.message: message"></wcs-sse>
```

- **Once per landing, not once per page.** Each stream chunk is a new object and lands in its own batch, so the watch fires on every landing; a Retry after a page is `done`, or a re-attached state element (the stream restarts on the current page), lands the same page again — keep an idempotency key in the feed.
- **Never derive the stream's `args` from the feed** — directly or through a getter. It restarts the stream on its own result and loads every page with no sentinel. Keep the cursor a plain property and advance it from an event (`$on: { sentinelChanged: (s) => { s.page = Math.floor(s.feed.items.length / s.pageSize) + 1; } }`).
- **Count occurrences on the event surface.** An equal primitive write never lands (the same-value guard), so a `$watch` on a bound element output (`loading`) misses a `true → true`; fold the token (`eventToken.loading: requestStarted` + `$on`).
- **Write only when the fold produced something new**: a plain write of an unchanged object passes the same-value guard (it skips primitives only) and re-fires every `$watch` and binding on it.
- If the state already has a `$watch` / `$on` handler for that path or token, merge the fold into it: in an object literal a later key silently replaces the earlier one.
- Keep the accumulation bounded (`slice(-49)`, a count) — there is no backpressure.
- **Order**: the handler's write lands in the next batch; a `$watch` on the output (`feed(feed) { … }`, e.g. re-arming a sentinel) fires at the end of that batch, after its rows have rendered (without a `<wcs-view-transition>` accepting `state`; with one, bindings apply on a frame and the `$watch` runs first — §10). A reset written from a `$watch` happens at the end of the batch, not at the moment of the triggering write.
- The output is plain state: a re-set (`setInitialState`) replaces it like any other key, and SSR never runs the watch.

Working demo: `examples/state-intersect-scroll/` (its feed).

## 16. If you meet 3.x code

4.0 keeps the markup and the `$` APIs, so most 3.x pages need only the rows below. The path for an existing page is the one in the wcstack repo's `docs/migration-v4.md`: pin the CDN major (`https://esm.run/@wcstack/state@3/auto`), move every package to 3.5 and clear its `[wcs/v4-migration]` console warnings and `wcs/v4-migration` lint infos (all but those for the three options that move to `$behavior`), then move every package — `@wcstack/server` together with the client — to 4.0 at once. Use `@wcstack/lint@3.5` and the VS Code extension 1.21.x on 3.x projects: the 4.0 rules report forms 3.x accepts. Code older than 3.0 (a second `#`, a value after `else:`, unquoted `eq(true)` compared as text, `<wcs-state name>`): `docs/migration-v3.md` first — 4.0 rejects those forms as 3.0 did.

| 3.x form | In 4.0 | Write instead |
|---|---|---|
| Filters `inc` `dec` `fix` `uc` `lc` `cap` `rep` `rev` `pad` `null` | `[wcs/filter-unknown]` #501 at initialization (lint: warning naming the replacement) | `add` `sub` `toFixed` `upper` `lower` `capitalize` `repeat` `reverse` `padStart` `nullIfEmpty` |
| `substr(start, length)` | #501 | `slice(start, start + length)` — a negative start counts from the end in both, but the end differs: check those by hand |
| `this.$trackDependency` / `this.$untrackDependency` | throws when read (`[wcs/name-alias]` #1701) | `$dependOn` / `$untracked` |
| `$updatedCallback` / `$streams` declared | throws when the state loads (`[wcs/declaration-alias]` #1601); reading `this.$streams` is `undefined` (lint `wcs/declaration-alias-read`) | `$renderedCallback` / `$stream` |
| `$scan: { out: { from: "path", initial, fold } }` | throws when the state loads (`$scan was removed (use $watch or $on)`, #1; lint `wcs/scan-declaration-invalid`) | `out: initial` as a key, and `$watch: { path(cur, prev, ...i) { const next = fold(this.out, cur, prev, ...i); if (next !== this.out) this.out = next; } }` |
| `$scan: { out: { on: "token", initial, fold } }` | same | `out: initial`, and `$on: { token: (state, e, ...i) => { const next = fold(state.out, e, ...i); if (next !== state.out) state.out = next; } }` |
| `resetOn: ["p"]` in a `$scan` entry | same | `$watch: { p() { this.out = /* a fresh copy of initial */ []; } }` — declared **after** the fold handler when the reset must win; the reset happens at the end of the batch |
| `bootstrapState({ enableMustache, sameValueGuard, enableDirectionalInitialSync })` | throws `#44` (`4.0 moved it to the state's $behavior.`) | `$behavior: { … }` in **each** root state that needs it (a 3.x option covered the whole page) |
| `bootstrapState({ debug, commentTextPrefix, enablePropagationContext })` | throws `#44` | Remove them; rewrite comment bindings that used a custom keyword as `<!--@@: path-->` / `<!--@@wcs-text: path-->` |
| An unknown option or a wrong-typed value in any `bootstrapXxx(config)`; the autoloader's `scanImportmap` | throws (3.x ignored it, 3.5 warned) | Remove or fix it — `/auto` passes no options |
| `event.currentTarget` in an `on*:` handler of `click` / `dblclick` / `input` / `change` / `submit` / key / mouse / pointer down and up | the root (lint `wcs/delegated-current-target`) | `event.target.closest(…)`, the loop index, or `on*#direct:` (§8) |
| `#stop` meant to stop your own ancestor listeners; inner handlers expected to run when an ancestor calls `stopPropagation()`; handlers on elements moved under another root | no longer so (nothing reports it) | `on*#direct:` on those bindings |
| Reordering rows by writing list elements (`$resolve("items.*", [0], b)`, `this["items.0"] = c`) | replaces the value at the position; rows do not move | Assign a new array (§4) |
| `for: items\|filter(…)` | `[wcs/binding-syntax]` #121 | A getter returning the filtered list (§4) |
| `outerHTML:` / `outerText:` inside `for:` / `if:` templates | `[wcs/template-syntax]` #203 | `innerHTML:` on a wrapper element |
| `{{ b.*.y }}` inside `for: a` | `[wcs/wildcard-rank]` #1403 | A getter reading the other row with `$resolve(path, indexes)` |
| A volume with `$watch` / `$listKeys` / `$renderedCallback` (they ran relative to the mount path) | volume not grafted (`console.error`) | The root state with full paths (`"cart.total"`); filter the root `$renderedCallback`'s paths by the `cart.` prefix |
| A volume injection (`<wcs-state mount="cart" data-wcs="state.taxRate: settings.taxRate">`) | volume not grafted | A root getter reading both paths |
| `$listKeys` / tokens / `$on` / `$errorCallback` in a mounted component (3.x ignored them with a warning) | they run, on the component's own lists and bindings | Keep them if that is what you meant; move them to the root otherwise |
| CSS / test selectors `[data-wcs…]` on row or branch elements | no longer match | A class or a `data-*` attribute |
| A custom element that relied on state writing its input attributes (no setter, or reads inputs only in `attributeChangedCallback`; CSS on `[active="false"]`) | state writes the property only — 3.x also wrote the attribute (`String(value)`) | Reflect in the setter, with the element's own encoding |
| `$watch("items.0.v")` relied on to fire on any row write | fires only when that value changes | — |
| `$watch("items.*.x")` with `$listKeys` added only so the watch fires headless | not needed (row watches are headless); keep `$listKeys` for refetched rows | — |
| A `/core` page using `$listKeys` | `[wcs/feature-not-installed]` | `installFeatures([listKeys])` from `@wcstack/state/features/list-keys` |
| Children inside a `textContent:` / `innerHTML:` element, `<noscript>` / `<iframe>` content, comment bindings inside `<textarea>` / `<title>` | not bound | Separate elements (§3) |
| Output of a 3.x `@wcstack/server` in front of a 4.0 client | snapshot discarded, client render | Deploy server and client together; purge cached 3.x HTML; keep `--` out of text-binding expressions while a 3.x server renders |
| `IStateElement.listPaths` / `getterPaths` / `setterPaths` / `nextVersion()` | removed | — |

What a 3.x page shows that a 4.0 one does not: `[wcs/v4-migration]` console warnings (3.5, full entries only) and `wcs/v4-migration` / `wcs/name-alias` lint infos — each names the 4.0 form in the table above. Workarounds for 3.x bugs (`$postUpdate("mode")` after a mounted component's private-key write, keeping two `for:`s mounted and toggling `hidden`, `this.items.with(…)` instead of an index write on an unrendered list, a wrapper element only to make a top-level route template render) still work in 4.0 and can be dropped.

## Pitfall Checklist

1. The runtime does not observe `this.user.name = "Bob"` — always use `this["user.name"] = "Bob"`; lint reports `wcs/nested-assign` (error).
2. The runtime does not observe destructive array methods or direct index assignment — reassign a new array, use `this["items.0"] = value`, or `this.items = this.items.with(0, value)`; lint reports `wcs/array-mutation` / `wcs/array-index-assign` (errors — `wcs-validate` exits `1`; fix the assignments, not the gate).
3. `onclick:` cannot take arguments — use zero-argument wrapper methods, or read the loop index argument.
4. The `for:` path must be an array — while the fetch `value` is null, interpose a `?? []` derived getter. `for:` takes no filters (#121): loop over a getter that returns the filtered list.
5. Bare names on the command binding right side throw (#1201) — `$command.fetchUsers` is required.
6. The `eventToken.` key is the wcBindable **property name**, not the raw DOM event name.
7. `wcs-fetch:response` (the value event) also fires on HTTP/network errors — check the status in `$on`.
8. Do not seed convenient initial values into output-only wcBindable members (the element's real initial value replaces them).
9. `$stream` sources must not ignore AbortSignal (ReadableStream sources satisfy this automatically via `cancel()`; only hand-written async iterables must watch `signal`).
10. Do not forget the trailing colon on `else:`.
11. Duplicate entries in `$commandTokens`/`$eventTokens` and undeclared keys in `$on` are initialization-time errors. Accessing an undeclared token in script (`this.$command.typo`) yields `undefined`; in markup it throws `[wcs/token-undeclared]`.
12. There is no public filter registration API — do transformations the 47 built-ins cannot express in a getter. The 3.x short names and `substr` are gone (§16).
13. The only valid separator for multiple bindings in `data-wcs` is `;`.
14. A property binding is same-value guarded: an `Object.is`-equal primitive write is skipped entirely (no dependency walk, no DOM apply, no `$renderedCallback`). Take repetition from the event-token surface — or from an I/O-node property declared `semantics: "event"`, which is exempt.
15. `$on` handlers are never awaited. An async handler's rejection is reported via `console.error`, not propagated — do not sequence work on it.
16. Under a strict CSP the default state form (inner `<script type="module">`) is blocked unless the `<script>` that loads state carries the page nonce — it is imported through a `blob:` URL, and that import inherits the loading tag's nonce. Where no nonce can be issued, move the state to `src="./state.js"` (preferred under a strict CSP either way), or open `script-src blob:` knowingly. The browser also evaluates that inner module itself, so its top-level code can run twice — keep side effects out of it (§2).
17. `$renderedCallback` reports only paths whose live DOM bindings were applied. It is not a headless watcher; an unbound write never reaches it — declare `$watch` (§10) for that.
18. A `$listKeys` key is the **list path itself** — `"items"` or the nested `"items.*.children"`, never a path ending in `*`. Rows must be plain objects with keys that exist and are unique; a duplicate/missing key or a class instance raises. Remember `this.items !== theArrayYouAssigned` afterwards. On `/core` it needs `features/list-keys`.
19. DCC and `bind-component` are mutually exclusive per component; a duplicate entry in `$bindables` / `$commands` is an error.
20. `getBindingsReady(root)` resolves when the root's bindings are built (also when `$connectedCallback` then fails) and rejects only when every `<wcs-state>` on that root failed before building them — handle the rejection if you `await` it. It covers mounted scopes once the mount record resolves; await the component's own `<wcs-state>` when its contents specifically matter.
21. `$watch` keys are root-scope paths only: no `@`, no `$`-prefix, no `**`. To react to `$streamStatus.<name>`, mirror it through a non-`$` getter and watch that (a watched getter turns eager, so it evaluates even unrendered).
22. Row watches are headless (no `for` or `$listKeys` needed). A whole-array assignment fires only the rows that entered the list, with `prev` undefined — after a `fetch().json()` refresh that is every row, unless `$listKeys` turns it into per-field writes.
23. `$watch` handler exceptions are isolated (console + devtools, remaining watches still run), write chains are cut at 32 links (counted per write; only the handlers those writes fired are skipped), and SSR never runs watches. A **mounted** `bind-component` scope does not run `$watch` / `$stream` / `$renderedCallback` (one warning); a volume declaring them is not grafted.
24. A structural binding (`for` / `if` / `elseif` / `else`) must be alone in its `data-wcs` (#201) — at page level the whole `<wcs-state>` then fails to initialize.
25. A `[wcs/...]`-prefixed runtime error means the lint CLI reproduces the same finding with a source range — run `npx @wcstack/lint` and fix every instance, not just the throwing one. A `#<number>` without a sentence means the page runs `/core` without `features/diagnostics` (`docs/state-errors.md`).
26. Getters read only through `this` — an untracked read (`Date.now()`, the DOM, a module variable) keeps its first value forever. State the input as state, or use `$dependOn` / `$postUpdate`.
27. `$resolve` requires the index count to match the path's `*` count exactly; `$getAll` treats it as an upper bound. Surplus indexes throw `wcs/index-arity`. Two arguments read, three write.
28. Writing a top-level key the state does not declare creates it — a write typo is silent. Declare every key; `defineState` / `wcs-tsc` catch the typo.
29. The filters' default locale is `<html lang>`, read when state is evaluated — a page that omits `lang` formats in English, and changing the locale after render updates nothing. Set `<html lang>` in the markup.
30. `$setAll` broadcasts arrays by default — replacing each row with successive entries needs `{ spread: true }` (length mismatch throws). `undefined` from a mapper means "skip this row", never "write undefined". Omitted `$getAll` indexes default to the **loop context** — inside a `for`-scoped getter that narrows to the current row; pass `[]` explicitly for "every match".
31. A `stateSchema` in the nearest `wcstack.manifest.json` (generated by `wcs-schema emit src/state.ts`, or hand-written) turns a missing path into `wcs/path-nonexistent` (**error**) and `for:` on a non-array into `wcs/path-type-mismatch` — the discovery walks up from the HTML file, and an explicit manifest argument replaces discovery for the whole run. It carries a single `stateSchema` (one tree per root); a volume contributes a subtree via `--mount=<path>`. Paths under a bare `{}` stay silent; methods, getters and `$listKeys` from the inline script still count, and so do row fields the analyzer reads from `concat({ … })` / `toSpliced` / `with` / spread-array assignments. Gate CI with `wcs-schema check` and regenerate with `emit --merge` after changing the state type.
32. One tree per rootNode: split modules with `mount=` (§2), hand a component a subtree with `state: path` (§12). `name=` / `@name` are gone (`wcs/named-state-deprecated`, error).
33. Mount rules (`state: path`): an array cannot be the mount root — mount the row (`state: .`) or the object holding it. An own key that shadows a mount-point key stays **private and hides the tree value** (rule R1, `wcs/mount-own-key-shadow`); an explicit partial mount beats a default of the same name. One `<wcs-state bind-component>` per component; a wildcard-terminal accessor (`get "tags.*"()`) over a mounted list raises. The component's **getters are exported** at the mount point — private data keys and methods are not; a tree key of the same name wins (`wcs/mount-export-shadowed`); the first host read may be `undefined` until the component registers, so write `(x ?? 0)`.
34. `wcs-validate --strict` exits `1` on **warnings** too. It is the way to make a path typo (`wcs/binding-path-missing`), a removed filter name (`wcs/filter-unknown`) or a wildcard-rank warning — all of which the runtime throws on or drops — fail CI; run it once every `<wcs-state src>` resolves, and expect the false warnings on paths of a volume loaded with `src=`.
35. The **root `<wcs-state>` is required** — a page with only `mount=` volumes is a loud error. `mount` must be a static dotted path; `*` / `$` / `#` / `@` / empty segments are refused and lint as `wcs/mount-path-invalid`. A volume on a path the root already has is not grafted; writing a mount point's parent wholesale from the root throws.
36. `setInitialState()` cannot re-set a tree that already has volumes or mounts on it, cannot re-set a `mount=` volume element itself, and may not change `$behavior` (#45). Write the individual paths, on the root state. Re-setting a plain initialized tree re-renders the page (§11) — hand it a new array when a list changed.
37. A volume (`<wcs-state mount>`) hosts data, getters, methods and the connected/disconnected callbacks **relative to its mount path**. `$watch` / `$listKeys` / `$renderedCallback` / `$stream` / `$recursion` / `$behavior` / `$features` or an injection on the element → the volume is **not grafted** (`console.error`); tokens, `$on` and `$errorCallback` → not run (`console.warn`). Declare them on the root state with full paths.
38. On your own `static wcBindable` element, a two-way binding writes **`getter(event)`** to state, defaulting to the whole **`e.detail`** — never `element[propName]`. Dispatch the value itself as `detail`, or declare `getter: (e) => e.detail.value` / `(e) => e.target.value` (§12).
39. A binding that throws while applying is **isolated and reported to `console.error`** — that node stays stale, nothing else is rolled back. Declare `$errorCallback(error, { path, bindingType, node })` on the **root** state (a mounted component's covers its own bindings; a volume's is not run) to route the report in-page. It does not cover `$watch` handlers or `$connectedCallback` / `$renderedCallback` exceptions.
40. `this.form.name` inside a getter tracks **`form` only** — read `this["form.name"]`; `wcs-validate` / VS Code report `wcs/getter-untracked-read`. Reads inside a setter are never tracked, and the same-value guard skips primitives only (§6).
41. Under `require-trusted-types-for 'script'` the `html:` / `innerHTML:` bindings and `<wcs-fetch target>` need a sanitizing policy you install, and `<wcs-layout>` / `<wcs-worker>` need `trusted-types wcstack` in the CSP (§2).
42. `**` (§14) is **authoring notation for the state definition only** — refused in markup, `$watch` / `$listKeys` keys, `$resolve` / `$postUpdate` / `$dependOn` and assignments (`wcs/recursion-unsupported`), and meaningless without `$recursion`.
43. **Unioning an aggregate double-counts, and nothing catches it.** `$getAll("nodes.**.total", [])` adds every node's total, each of which already folds its own subtree. Union raw values (`nodes.**.value`) or sum the roots (`nodes.*.total`).
44. A **bound** `**` reads its depth from the innermost evaluation frame only — from the top level, or from a plain getter a recursive getter calls, it is `wcs/recursion-context`.
45. A recursive `$setAll` takes **`[]` plus a plain value** and nothing else, and may not target the structure or a recursive getter (read-only at every spelling — `wcs/recursion-readonly`).
46. The recursion input must be a **tree** (`wcs/recursion-shared-list` / `wcs/recursion-cycle`), 128 wildcard levels at most.
47. A self-referential component must not declare its own key for what the mount provides (`wcs/mount-own-key-shadow`), and must build its shadow in `connectedCallback`, not the constructor.
48. An accumulation that must outlive a `$stream` restart is **a key you own**, folded in a `$watch` handler on the stream's value (or an `$on` handler) (§15). Keep it bounded, keep an idempotency key (the handler runs once per landing, not once per page), and never derive the stream's `args` from the feed.
49. **Events are delegated** (§8): `event.currentTarget` in a plain `on*:` handler of a bubbling event is the root — use `event.target.closest(…)` or the loop index. `on*#direct:` where the element itself is needed, where `#stop` must stop your own ancestor listeners, where an ancestor calls `stopPropagation()`, or where the element moves under another root; an outer `#direct` runs before inner delegated handlers.
50. **Writing a list element replaces the value at that position** — rows do not move; reorder by assigning a new array (§4). `data-wcs` is removed from row and branch elements, so select them by class.
51. **A `for:` over a getter returning a filtered copy** (TodoMVC) and **one object at two positions** are the 4.0 limitation (#365): a write below one row does not reach the other list's (or position's) row bindings — reassign the source list with a new row object.
52. **Numeric keys under a plain object** (`sales.2024.total`) read `undefined` from the script and throw on write in 4.0 (known limitation) — read `this.sales[2024].total` and replace the top-level object.
53. **Configuration**: `bootstrapState()` takes notation only and throws `#44` on anything else; `$behavior` in each root state holds `enableMustache` / `sameValueGuard` / `enableDirectionalInitialSync`; every package's `bootstrapXxx(config)` throws on an unknown option (§11).
54. **Initialization failures are loud and final** (§11): `#49` / `#50` once, `connectedCallbackPromise` rejects, `initializePromise` resolves, a failed element cannot be re-armed. In the 4.0 preview a page-level markup error fails the whole `<wcs-state>` — lint before you deploy.
55. **Text at page level**: prefer `<!--@@: path-->` or `textContent:` over `{{ }}` (FOUC). Comment bindings bind even with `enableMustache: false`, not inside `<textarea>` / `<title>`. Children of a content-setting element (`textContent:`, `innerHTML:`, `html:`) and of `<noscript>` / `<iframe>` are never bound (§3).
56. **User content is not markup**: never place user text where the page scan reads it (`{{ }}`, `data-wcs`, comment bindings — HTML-escaping does not neutralize `{{ }}`, and there is no opt-out attribute in 4.0); deliver it through state and render it with a text binding (§2).
57. A "selected row" flag over a long list belongs in `$eqPath` / `$eqIndex` (§6), not in `this["items.*.id"] === this.selectedId`. Point `path` at the written state (a getter path re-evaluates every row); keys compare without coercion, so convert an input's string (`value|number: selectedId`). `$eqIndex` throws outside a list row.
58. **SSR**: server and client at the same major.minor (a mismatched snapshot is discarded and the page re-renders on the client), comments kept in the output, JSON values only in SSR state (§11).
59. The split entries (§1) load from jsDelivr's plain file paths or a bundler, **never `esm.run`**. A missing feature throws `[wcs/feature-not-installed]` / `[wcs/filter-unknown]`; only a missing `features/diagnostics` is silent (numbered messages, no path warnings). When in doubt, use `/auto`.
60. A render that writes something new every time is cut after 100 drains (`render chain depth limit exceeded …`, §11); values written past the cut stay in state. Break the cycle — write only when the value really changes.
