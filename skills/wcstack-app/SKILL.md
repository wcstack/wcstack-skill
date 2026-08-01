---
name: wcstack-app
description: Build web apps, SPAs, and demo pages with wcstack (@wcstack/state, router, signals, and the wcs-* I/O node components such as wcs-fetch / wcs-storage / wcs-ws). Follows the project's standards-first, zero-config, buildless principles — one-line CDN loading, then state design → data-wcs binding → I/O node wiring → routing, with exact syntax. Use when the user asks (in any language) to build something with wcstack, wcs-state, data-wcs, wcs-fetch or other wcs-* tags, or a signals-based app (e.g. "build an app with wcstack", 「wcstackでアプリを作って」「wcs-fetchで〜して」). Also covers embedding wcs-* I/O nodes inside a React / Vue / Svelte / Solid app via the wc-bindable adapters. Do NOT use for generic Web Components / Custom Elements questions unrelated to wcstack, for building React / Vue / Lit / NoJS apps that do not touch wcstack, or for developing or modifying the wcstack packages themselves.
metadata:
  wcstack-version: "1.24.0"
---

# Building apps with wcstack

## Overview

wcstack is a family of "standards-first, zero-config, buildless" Web Components packages. An app is correctly a **single HTML file + one-line CDN loads** — do not introduce bundlers, build steps, or npm install unless the user explicitly asks for them.

Content verified against **wcstack v1.24.0** (READMEs, examples, and source as of 2026-08). If the installed/CDN version is much newer, spot-check syntax against the package READMEs.

Generated-code accuracy lives in the exact syntax. **This file holds only the workflow, a cheat sheet, and the failure-mode matrix**; full syntax is split into references/ next to this file. Read the matching reference before entering each phase:

| File | Read before |
|---|---|
| `references/state-binding.md` | writing `<wcs-state>` / `data-wcs` / filters / command- & event-tokens |
| `references/router-and-scaffold.md` | writing SPA routing / autoloader / index.html scaffold / server |
| `references/io-node-catalog.md` | wiring I/O nodes (35 wcs-* tags) or writing a signals app |

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
- There is a bare-name `wcstack` npm package — it is **documentation only, do not install it**. Buildless CDN loading stays the correct path.

### 3. State design (state family)

State is a plain object `export default`. Computed values are getters keyed by dot-path strings (`get "cart.total"()`, wildcard `get "users.*.fullName"()`). Decide up front:

- One state slot per I/O node (`listFetch: { value: null, loading: false, error: null, status: 0 }`)
- `for:` requires an array — wrap nullable sources in a derived getter: `get rows() { return this["listFetch.value"] ?? []; }`
- Never seed convenient initial values into output-only element properties (the element is the authority; seed real initial values like `null` / `false`)

### 4. Bindings → I/O wiring → routing

Read the references, then write. Four wiring forms between state and I/O nodes:

1. Property binding: `data-wcs="value: users; loading: busy"`
2. Spread: `data-wcs="...: listFetch"` (all wcBindable properties + inputs; commands/events excluded)
3. Command-token (state → element): `data-wcs="command.fetch: $command.refresh"` + `$commandTokens`
4. Event-token (element → state): `data-wcs="eventToken.value: responded"` + `$eventTokens` + `$on`

Positive rules with no failure-mode row below: use `<wcs-link to="...">` instead of raw `<a>` (basename handling + `active` class); wire live handles (MediaStream etc.) element-to-element via `eventToken` → `$command.attachStream`, never through state; `trigger` is a momentary input property, not a command — any truthy write fires (no edge detection, and it bypasses `manual`), so seed its slot with `false`. Exception: on `wcs-debounce`/`wcs-throttle`, `trigger` IS a command.

### 5. Server and verification

- **Lint every generated HTML file before browser testing**. During authoring, keep warnings visible:

  ```bash
  npx @wcstack/lint index.html
  ```

  Pass every generated HTML file and `wcstack.manifest.json` sidecar as separate arguments when the app has more than one file. Read the stable `wcs/*` diagnostic codes and `source:line:col` ranges, fix all errors and actionable warnings, then rerun. The CLI machine-checks the real contracts — `data-wcs` syntax / filters / state paths, wcs-* tag members (`command.` / `eventToken.` keys included, with typo suggestions), non-reactive nested/array mutations, `trigger` slots seeded `true`, storage seed clobber, missing `<base href>`, and signals dual-entry.
- **Use the quiet form only as the final CI gate**:

  ```bash
  npx @wcstack/lint --errors-only index.html
  ```

  Append other HTML files and `wcstack.manifest.json` only when they exist. `--errors-only` (alias `--quiet`) hides warning/info lines but does not change their counts or the exit code. Exit `0` means no error-severity diagnostics (warnings may still exist), `1` means one or more errors, and `2` means invalid usage or a file-read failure. Messages follow the environment locale; use `--lang=ja` or `--lang=en` to force it. In VS Code, the WcStack IntelliSense extension shows the same diagnostics and ranges inline.
- A static single page needs no server (recommend a tiny server if it fetches).
- An SPA needs the fallback "every extensionless non-API GET returns index.html" (implementation in router-and-scaffold.md §7).
- After finishing, do a minimal run in a browser or via a tiny server. For working references, see `examples/` (multi-package demos) and `packages/*/examples/` (single-package demos) in the wcstack repo.

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
  $commandTokens: ["reload"],
  $eventTokens: ["responded"],
  $on: { responded(state, ev) { /* check ev.detail.status first */ } },
};
```

Full syntax (modifiers, 40 built-in filters, nested loops, `$getAll` / `$resolve`, spread rules): `references/state-binding.md`.

## Silent-failure matrix (these break without an error)

Run `npx @wcstack/lint` without `--errors-only` first (§5), fix its actionable warnings, then self-review against this table:

| Mistake / combination | Symptom | Correct form |
|---|---|---|
| `this.user.name = v` (nested property mutation) | DOM stays stale; lint reports `wcs/nested-assign` | Path assignment: `this["user.name"] = v` |
| `push` / `splice` / `sort` or `this.items[0] = v` on arrays | DOM stays stale; lint reports `wcs/array-mutation` or `wcs/array-index-assign` | Reassign a new array (`toSpliced` / `concat` / `filter` / `toSorted`), or use `this["items.0"] = v` / `this.items = this.items.with(0, v)` |
| `for:` bound to a null / non-array path | List breaks | Derived getter with `?? []` |
| Arguments on `onclick:` | Cannot pass arguments | Zero-arg wrapper method per variant |
| Bare name on command binding (`command.fetch: reload`) | Never fires | `$command.reload` (the `$command.` prefix is mandatory) |
| Raw DOM event name as `eventToken.` key | Never fires | Use the **wcBindable property name** |
| Expecting spread (`...:`) to wire commands/events | They stay unwired | Wire `command.` / `eventToken.` explicitly |
| Right-hand filter on spread (`...: slot\|f`) | Error | Filters go on individual property bindings |
| `data-wcs` inside router-stamped content | Bindings never collected (state scans the DOM at bind time) | Put bound templates under body-level `<template data-wcs="if: ...">`; routes hold `<wcs-head>` + static content only |
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
| Mixing `@wcstack/signals` and `@wcstack/signals/dom` on a CDN page | Two reactive cores, broken seams | Import everything from the single `/dom` entry |
| Custom filter registration | No such API exists | Compose the 40 built-in filters, or compute in a getter |

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
