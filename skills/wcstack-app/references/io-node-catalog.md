# wcstack I/O Node Catalog + signals Quick Reference

Sources: each package's README (ja preferred) plus the `static wcBindable` / `static observedAttributes` declarations in src, `packages/signals/README.ja.md`, and `examples/signals-live-search`. All 35 tags are cross-checked against source at v1.21.7 (contracts unchanged through v1.22.3) — attribute spellings, properties, commands, and the timing notes below are source-verified.

## 0. Common Conventions (all I/O nodes)

- **One-line CDN**: `<script type="module" src="https://esm.run/@wcstack/<pkg>/auto"></script>` alongside `@wcstack/state/auto`. Load order does not matter (deferred module execution; state waits via `whenDefined`) — the one exception is `@wcstack/devtools/auto`, which must load BEFORE state/auto (live wiring-ledger capture)
- **wc-bindable**: each tag declares via `static wcBindable` its **properties** (observable outputs; state subscribes) / **inputs** (write surface; attributes are kebab-case mirrors) / **commands** (invocable methods).
- **Wiring**: output binding `data-wcs="value: users"` / command-token `data-wcs="command.<method>: $command.<name>"` / event-token `data-wcs="eventToken.<property>: <name>"` / spread `data-wcs="...: slot"`.
- **Common idioms**:
  - `manual` attribute = do not auto-start on connect. **No `manual` does NOT imply auto-start**: idle / tilt / accelerometer / gyroscope / magnetometer / ambient-light-sensor never auto-start — they are inert until the `start` command.
  - `trigger` is a **momentary input property**, not a command (`command.trigger` exists only on `<wcs-debounce>` / `<wcs-throttle>`, which have no trigger property). **No edge detection**: any truthy write fires, then self-resets to `false`, and it bypasses `manual` — a state slot seeded `true` fires at bind. Always seed trigger slots with `false`.
  - **Frozen-after-connect**: most inputs are read at connect or at the next command call only — changing the attribute later is silently ignored. Live (reacting to change): fetch/ws/sse `url`, storage `key`, broadcast `name`, worker `src`, camera constraint attrs, intersect/resize target + geometry, wakelock `active`/`type`, timer `interval` (while running only). Frozen surprises: permission `name`, defined `tags`, sensor `frequency`, idle `threshold`, clipboard `monitor`, notify `mode`, listen options while listening, recorder options while recording.
  - **Never-throw**: failures land in the `error` output; nothing throws. Too-early writes are dropped, not queued — ws `send` before connected, broadcast `post` before `open`, worker `post` before `start` all silently divert to `error`. Bind `error` in every app.
  - fullscreen / pip / pointer-lock `target`: re-resolved at each command invocation; default is the first child element, else the element itself.
  - Event names are `<tag-name>:<kind>` (exceptions: screen-orientation uses `wcs-orientation:*`, `<wcs-throttle>` uses `wcs-throttle:*`).
  - Nearly every node has `error` / `errorInfo` outputs (the ones without: timer / raf / debounce / permission / network / intersection / resize). Sensor-family `error` is sticky — a later successful `start` does not clear it. Omitted from the table.

## 1. Catalog

| package | tag | key attributes / inputs | properties (outputs) | commands |
|---|---|---|---|---|
| **fetch** | `<wcs-fetch>` (helpers: `<wcs-fetch-header name value>` `<wcs-fetch-body type>` `<wcs-infinite-scroll>`) | `url`(live: change re-fetches — same-url writes skipped, in-flight aborted) `method` `target` `manual` `body`(one-shot: consumed per fetch; a mid-flight write stages for the NEXT fetch) `response-type`(auto/json/text/blob/arrayBuffer) `trigger`(no-op while `url` is empty) | `value` `loading` `error` `status` `objectURL` `trigger` | `fetch` `abort` |
| **storage** | `<wcs-storage>` | `key` `type`(local/session) `value` `manual` `trigger` | `value` `loading` `error` `trigger` (with cross-tab sync) | `load` `save` `remove` (all synchronous) |
| **upload** | `<wcs-upload>` | `url` `method` `field-name` `multiple` `max-size` `accept` `manual` `files`(auto-upload fires on `files` write, NOT on `url` change) `trigger` | `value` `loading` `progress` `error` `status` `files` `trigger` | `upload` `abort` |
| **websocket** | `<wcs-ws>` | `url` `protocols` `auto-reconnect` `reconnect-interval` `max-reconnects` `binary-type` `manual` `trigger` `send` (writing a value sends immediately; objects are auto-JSON-serialized). Options besides `url` are read per `connect`; clearing `url` does not disconnect — `close` does | `message` `connected` `loading` `readyState` `trigger` `send` | `connect` `sendMessage` `close` |
| **sse** | `<wcs-sse>` | `url` `with-credentials` `events` `raw` `manual` `trigger`. Options besides `url` apply only via `close`→`connect` (`connect` to the same url is a no-op) | `message` `connected` `loading` `readyState` `trigger` | `connect` `close` (receive-only) |
| **broadcast** | `<wcs-broadcast>` | `name`(live: change reopens the channel) `manual` | `message` (no self-echo; structured clone) | `open` `post` `close` |
| **worker** | `<wcs-worker>` | `src` `type` `name` `manual` `keep-alive`(thread outlives disconnect — caller must `terminate` or it leaks) `restart-on-error` `max-restarts`(cumulative lifetime budget) `restart-interval` | `message` `running` | `start`(no-op while the same `src` runs — `terminate`→`start` to apply option changes) `post` `terminate` |
| **timer** | `<wcs-timer>` | `interval`(default 1000; live while running only — frozen while stopped/paused) `once` `repeat` `immediate` (all read at `start`) `manual` `trigger` | `tick`(counter) `elapsed`(ms) `running` `trigger` | `start` `stop` `reset` `pause` `resume` (`stop`→`start` continues `tick`/`elapsed` — only `reset` zeroes) |
| **raf** | `<wcs-raf>` | `once` `repeat` (read at `start`) `manual` `trigger` | `tick` `elapsed` `dt` `running` `suspended`(hidden tab: `suspended` true, counters freeze, `running` stays true) `trigger` — `elapsed` counts active time only, not wall-clock | `start` `stop` `reset` `pause` `resume` (`stop`→`start` continues counters — only `reset` zeroes) |
| **debounce** | `<wcs-debounce>` / `<wcs-throttle>` (`wcs-throttle:*` events) | `source` (value-surface input; NO same-value guard — every write restarts the wait, and the initial bind write starts a cycle: throttle emits `value` immediately at startup) `wait` `max-wait` `leading`(debounce: opt-in attr, default off; throttle: default on, opt-out `no-leading`) `trailing`(default on; opt-out `no-trailing` — a bare `trailing` attribute is inert) | `value`(settled value) `fired` `pending` | `trigger` `cancel` `flush` (commands — no momentary trigger property here) |
| **clipboard** | `<wcs-clipboard>` | `monitor` | `text` `items` `loading` `readPermission` `writePermission` `monitoring` `copied` `cut` (both carry the document selection text, not the clipboard payload) `pasted` | `writeText` `write` `readText` `read` `startMonitor` `stopMonitor` (write requires a user gesture) |
| **geolocation** | `<wcs-geo>` | `high-accuracy` `timeout` `maximum-age` `watch` `manual` `trigger` (attributes are read at connect time) | `position` `latitude` `longitude` `accuracy` `coords` `timestamp` `watching` `loading` `permission` | `getCurrentPosition` `watchPosition` `clearWatch` |
| **permission** | `<wcs-permission>` | `name` (one tag, one permission) `user-visible-only` `sysex` | `state`(granted/denied/prompt/unsupported) `granted` `denied` `prompt` `unsupported` | none (monitor-only) |
| **notification** | `<wcs-notify>` | `notice` (reactive display; guarded vs the LAST SHOWN text — first non-empty bind fires; the `notify` command bypasses the guard) `mode`(auto/constructor/sw) `body` `icon` `badge` `tag` `lang` `dir` `require-interaction` `silent` `renotify` `manual`(mutes reactive `notice`; `notify` still works) | `permission` `granted` `denied` `prompt` `unsupported` `clicked` `closed` `shown` | `request` `notify(title, options)` `close` `closeAll` — without `granted`, `notice`/`notify` silently no-op into `error`: call `request` first (for SW use, `wireNotificationClicks()` from `@wcstack/notification/sw`) |
| **intersection** | `<wcs-intersect>` | `target` (default = first child / selector / `self`; non-matching selector → silent no-op, `observing` false) `root` `root-margin` `threshold` (live — but ALL attribute changes are ignored while `manual`) `once` `manual` `trigger`(re-runs `observe`) | `entry` `intersecting` `ratio` `visible` (latched on first intersection) `observing` `trigger` | `observe` `reobserve` `unobserve` `disconnect` `reset` (after `once` fires the observer is disconnected — `reset` alone can't re-latch `visible`, use `reobserve`) |
| **resize** | `<wcs-resize>` | `target` `box` `round` (live — but ignored while `manual`; selector no-match = silent no-op) `once`(fires on the INITIAL size delivery = measure-once) `manual` `trigger`(re-runs `observe`) | `entry` `width` `height` `observing` `trigger` | `observe` `unobserve` `disconnect` |
| **wakelock** | `<wcs-wakelock>` | `active` (desired input — durable intent: a request while hidden waits and auto-re-acquires on return to visible) `type` `manual`(gates only the connect-time auto-acquire) | `held` (actual output; reflects OS release) | `request` `release` |
| **camera** | `<wcs-camera>` | `audio` `facing-mode` `device-id` `width` `height` (live: changing while active re-acquires with the new constraints) `autostart`(connect-time only) `keep-alive` | `active` `permission` `audioPermission` `deviceId` `devices` `streamReady` (raw MediaStream; RE-FIRES with a NEW stream on every re-acquire — switchCamera / constraint change / visibility resume — consumers must re-attach) `ended` | `start` `stop` `switchCamera` |
| **camera** | `<wcs-recorder>` | `mime-type` `timeslice` `audio-bits` `video-bits` (properties `audioBitsPerSecond`/`videoBitsPerSecond`; all read at `start`) | `recording` `paused` `duration` `mimeType` `blob` `objectURL` `recorded` `dataavailable` | `attachStream` `start` `stop` `pause` `resume` (`start` without an attached stream silently errors; re-attaching mid-recording applies to the NEXT `start` only) |
| **speech** | `<wcs-speak>` (TTS) | `say` (reactive speech; guarded vs the LAST SPOKEN text — first non-empty bind speaks) `rate` `pitch` `volume` `voice` `lang` `manual`(mutes reactive `say` — bind it to the listening flag to break the listen→speak echo loop) | `voices` `speaking` `paused` `pending` `charIndex` `spokenWord` `unsupported` | `speak` (imperative; fires even on same value) `cancel` `pause` `resume` |
| **speech** | `<wcs-listen>` (STT) | `lang` `continuous` `interim` `max-restarts`(`continuous` alone still ends at the first silence — set `max-restarts` > 0 to keep the session alive) `manual` `trigger` (options frozen while listening) | `interimTranscript` `finalTranscript` `result` `listening` `permission` `unsupported` `trigger` | `start` `stop` `abort` |
| **defined** | `<wcs-defined>` | `tags` `mode` `timeout` (timeout detects load failure; ALL inputs frozen at connect; empty `tags` → `error`, `defined` stays false) | `defined` `pending` `missing` `count` `total` `error` (invariant: total=count+pending+missing) | none (event-token only; monotonic; terminal) |
| **fullscreen** | `<wcs-fullscreen>` | `target` | `active` | `requestFullscreen` `exitFullscreen` |
| **picture-in-picture** | `<wcs-pip>` | `target` (must resolve to a `<video>` — otherwise `error`) | `active` | `requestPictureInPicture` `exitPictureInPicture` |
| **pointer-lock** | `<wcs-pointer-lock>` | `target` | `active` | `requestPointerLock` `exitPointerLock` |
| **screen-orientation** | `<wcs-screen-orientation>` | (no inputs) | `type` `angle` `portrait` `landscape` (the initial snapshot fires before bindings attach — read the starting orientation in `$connectedCallback`; bound outputs update from the next change) | `lock` `unlock` |
| **idle** | `<wcs-idle>` | `threshold`(default 60000; read at `start` only) | `userState` `screenState` `active` | `requestPermission`(needs a user gesture) `start` `stop` |
| **network** | `<wcs-network>` | (no inputs) | `effectiveType` `downlink` `rtt` `saveData` `supported` (Firefox/Safari: `supported` false, data fields `null` — bindings must handle null) | none (monitor-only) |
| **share** | `<wcs-share>` | (no inputs) | `value` `loading` `cancelled` (`value` is written only on success — stale after a cancel/failure, check `cancelled`) | `share` (invoking while `loading` is a silent no-op) |
| **contacts** | `<wcs-contacts>` | (no inputs) | `value` `loading` `cancelled` (same no-op-while-loading / stale-`value` rules as share) | `select` |
| **credential** | `<wcs-credential>` | (no inputs) | `value` `loading` `cancelled` (user cancel surfaces as `NotAllowedError`, not `AbortError`) | `get` `store` (they share one in-flight lane — a concurrent call supersedes and silently drops the first) |
| **eyedropper** | `<wcs-eyedropper>` | (no inputs) | `value` `loading` `cancelled` | `open` (a second `open` aborts the prior pick into `cancelled`) `abort` |
| **tilt** | `<wcs-tilt>` | (no inputs) | `alpha` `beta` `gamma` `absolute` `permissionState` | `requestPermission` `start` `stop` (iOS: `start` before `requestPermission` is silently dead — no events, no error) |
| **accelerometer** | `<wcs-accelerometer>` | `frequency` | `x` `y` `z` | `start` `stop` |
| **gyroscope** | `<wcs-gyroscope>` | `frequency` | `x` `y` `z` | `start` `stop` |
| **magnetometer** | `<wcs-magnetometer>` | `frequency` | `x` `y` `z` | `start` `stop` |
| **ambient-light-sensor** | `<wcs-ambient-light-sensor>` | `frequency` | `illuminance` | `start` `stop` |

## 2. Minimal state-integration examples for high-frequency nodes (from each README)

**fetch** — a computed URL drives the fetch (auto re-runs on url change; aborts any in-flight request):
```html
<wcs-fetch data-wcs="url: usersUrl; value: users; loading: listLoading; error: listError"></wcs-fetch>
<ul><template data-wcs="for: users"><li data-wcs="textContent: users.*.name"></li></template></ul>
```

**storage** — two-way persistence of primitive values. The bound state slot is **intentionally initialized to `undefined`** (`""`/`null` would overwrite the stored value on the initial write-back = load-before-bind idiom):
```html
<wcs-storage key="username" data-wcs="value: username"></wcs-storage>
<input data-wcs="value: username">
```
v1.22+ declarative alternative: `data-wcs="value#init=element: username"` — the element's persisted value wins the initial sync regardless of the slot's seed, then normal two-way write-back resumes.
For object sub-property changes, bind a getter containing `$trackDependency` to `trigger` and persist with `manual` + save.

**websocket** — receive via `message`; to send, just write a value to `send`:
```html
<wcs-ws url="wss://example.com/ws"
  data-wcs="message: lastMessage; connected: isConnected; send: outgoing"></wcs-ws>
<!-- state side: sendChat() { this.outgoing = { type: "chat", content: this.chatInput }; } -->
```

**timer** — declarative `setInterval` equivalent:
```html
<wcs-timer interval="1000" data-wcs="tick: count; running: isRunning"></wcs-timer>
<!-- one-shot: <wcs-timer interval="3000" once data-wcs="tick: showBanner"> -->
```

**intersection** — lazy loading (`visible` is latched on first intersection; `once` disconnects):
```html
<wcs-intersect once data-wcs="visible: shown">
  <img data-wcs="src: src" alt="lazy">
</wcs-intersect>
<!-- infinite-scroll edge detection: <wcs-intersect target="self" data-wcs="intersecting: atEnd"> -->
```

**clipboard** — copy via command-token (write requires a user gesture):
```html
<wcs-clipboard data-wcs="command.writeText: $command.copy"></wcs-clipboard>
<button data-wcs="onclick: onShare">Share</button>
<!-- state side: $commandTokens: ["copy"], onShare() { this.$command.copy.emit(this.message); } -->
```
Read with `command.readText: $command.paste; text: pasted`; monitor with the `monitor` attribute + `eventToken.pasted: ...`.

**notification** — command-token (display) and event-token (click) coexist on one tag:
```html
<wcs-notify data-wcs="
  command.request: $command.request;
  command.notify:  $command.notify;
  eventToken.clicked: opened"></wcs-notify>
<!-- state side: $commandTokens:["request","notify"], $eventTokens:["opened"],
     send() { this.$command.notify.emit("New message", { body:"...", tag:"chat", data:{room:7} }); },
     $on: { opened: (state, event) => { /* event.detail = {tag,data,action} */ } } -->
```
The reactive form binds the `notice` attribute (with same-value suppression; recommend debounce + `tag` to prevent spam).

**camera/recorder** — a raw MediaStream never enters state; wire elements directly to each other:
```html
<wcs-camera data-wcs="eventToken.streamReady: streamReady"></wcs-camera>
<wcs-recorder data-wcs="command.attachStream: $command.attachStream"></wcs-recorder>
<!-- $on: { streamReady: (state, ev) => state.$command.attachStream.emit(ev.detail) } -->
```
`streamReady` re-fires with a new stream on every re-acquire (switchCamera / constraint change / visibility resume) — this `$on` wiring re-attaches each time. Start the recorder only after a stream is attached (a stream-less `start` silently errors).

## 3. signals Quick Reference (`@wcstack/signals`)

### Positioning (when to use vs state)

- `@wcstack/state` connects UI and state through **HTML path strings** (`data-wcs`); no reactive primitives appear in code. `@wcstack/signals` conversely **exposes signal/computed/effect directly** (no DSL, no `data-wcs`). The two are not competitors — they **coexist**.
- Out of scope for signals v1: SSR/hydration, deep/proxy reactivity (path-based deep tracking is state's territory), stream backpressure.
- The API is a minimal in-house implementation modeled on the TC39 Signals proposal.

### CDN loading (one-entry-per-page rule)

```html
<script type="importmap">
{ "imports": { "@wcstack/signals/dom": "https://esm.run/@wcstack/signals/dom" } }
</script>
<script type="module">
  import { signal, computed, effect, h, render, For, bindNode } from "@wcstack/signals/dom";
</script>
```

> **Known trap**: on the CDN each entry is a self-contained bundle with the core embedded, so importing both `@wcstack/signals` and `@wcstack/signals/dom` on one page causes **reactive core duplication** and reactivity breaks at the seam. On CDN pages import everything from the single `/dom` entry (`/dom` re-exports the entire core). No such constraint with local npm / bundlers.

### Basic API (core)

```js
const count = signal(0);                       // .get()=read+track / .peek()=no tracking / .set(v)
const doubled = computed(() => count.get() * 2); // lazy, memoized, equality short-circuit
effect(() => { console.log(doubled.get()); });   // runs immediately once, then coalesced into a microtask
count.set(1);        // effect re-runs on the next microtask
flushSync();         // synchronous flush (when reading DOM back in tests)
createRoot((dispose) => { /* effects/resources inside are disposed all at once by dispose */ });
onCleanup(fn);       // register cleanup on the current owner
```

### DOM layer (`h` / `render` / `SignalsElement`)

`h(tag, props, ...children)` builds real DOM once; only function/signal props and children update via individual effects (no VDOM). `onXxx` props are event listeners. For custom elements, extend `SignalsElement` and implement only `render()` (mounts on connect; disposes all effects on disconnect).

### Keyed lists — `For` / `Index`

```js
const todos = signal([{ id: 1, text: "a" }, { id: 2, text: "b" }]);
h("ul", null, For(todos, (t, index) => h("li", null, () => `${index()}: ${t.text}`), { key: (t) => t.id }));
// for primitive arrays use Index: each is (item: () => T, index: number)
h("ul", null, Index(nums, (n) => h("li", null, () => String(n() * 2))));
```

A plain reactive child (`() => items.map(render)`) regenerates everything on every change, so always use For/Index for lists. Key default is `===`; duplicate keys throw. `each` returns a single Node.

### Async — `resource` / `streamResource`

```js
const user = resource(
  async (userId, signal) => (await fetch(`/api/users/${userId}`, { signal })).json(),
  { args: () => id.get() },  // when a signal read inside args changes → abort the previous run and restart (switchMap)
); // user.value / user.loading / user.error are read-only signals

const log = streamResource((args, signal) => openLogStream(signal), {
  fold: (acc, chunk) => [...(acc ?? []), chunk], initial: [],
}); // log.value / log.status ("idle"|"active"|"done"|"error") / log.error. No backpressure; keep fold bounded
```

Strong contract: `source` must always honor the `AbortSignal` it is passed (this is what drives restart/dispose).

### wc-bindable bridge — `bindNode` (turn I/O nodes into signals)

```js
await customElements.whenDefined("wcs-fetch");
const bound = bindNode(fetchEl);              // descriptor is auto-derived from constructor.wcBindable
bound.signals.value.get();                    // output property → read-only signal (same-value guard)
bound.on("fired", { fold, initial });         // event-token stream (fires every time, even on same value)
bound.set("url", v);                          // imperative write to an input
bound.bindInput("url", someSignal);           // reactive reflection of signal → input (loops are guarded)
bound.command("fetch", ...args);              // invoke a command
bound.bindCommand("start", trigger, mapArgs); // invoke command on trigger change (does not fire on the initial value)
bound.dispose();                              // tear down everything (idempotent; inert afterwards)
```

Typing via `bindNode<FetchShape>(el)`. Real-world pattern: `effect(() => bound.set("url", ...))` for the query → `<wcs-fetch>` auto-fetches → read `bound.signals.value` in a `computed` and render with `For` (examples/signals-live-search).

### Stability

The core (signal/computed/effect/createRoot/onCleanup/flushSync) and resource/streamResource are **Stable**. `bindNode`/`nodeSource` and the DOM layer (h/For/Index/SignalsElement) are **Evolving** (may change in minor releases).
