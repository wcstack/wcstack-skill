# wcstack I/O Node Catalog + signals Quick Reference

Sources: each package's README (ja preferred) plus the `static wcBindable` / `static observedAttributes` declarations in src, `packages/signals/README.ja.md`, `docs/signals-definition-timing.md`, `docs/architecture-hardening/12-wc-bindable-observable-inventory.md`, `docs/audio-tag-design.md`, `docs/midi-tag-design.md`, and `examples/signals-live-search`. The 38 pre-v1.25 tags were cross-checked against source at v1.21.7 — attribute spellings, properties, commands, and the timing notes below are source-verified. Since then: v1.23.0 added `mountNode` to signals and normalized Core as a public headless surface; v1.24.0 declared observation semantics on every property (§0) and stopped the same-value guard from swallowing occurrences; **v1.25.0 added `@wcstack/audio` (11 tags) and `@wcstack/midi` (1 tag)**, bringing the catalog to **50 I/O node tags** — those two are read from v1.26.0 source. Every pre-existing tag/property/command name is unchanged; v1.27.0–v1.31.0 changed no tag/property/command names (v1.27 changed state `$watch` / filters / bind-component; v1.28–v1.30 are tooling — canonical parser, lint external-src resolution, VS Code lenses, devtools coverage — see `state-binding.md`), only the stream-commit recipe below moved to `$watch`. v1.31 added **scoped custom element registry** support across every package (Chrome/Edge 146+, Safari 26+): definedness checks resolve against the node's own registry with a global fallback (unchanged behavior when the feature is absent), every `registerComponents(registry?)` can define into a scoped registry (devtools deliberately stays global), and `<wcs-defined>` reports tags `missing` immediately when no registry governs them instead of pending forever.

## 0. Common Conventions (all I/O nodes)

- **One-line CDN**: `<script type="module" src="https://esm.run/@wcstack/<pkg>/auto"></script>` alongside `@wcstack/state/auto`. **Load every I/O node (and `@wcstack/devtools/auto`) BEFORE `state/auto`** — module scripts run in document order, so this guarantees the elements are defined before state binds. Property/spread bindings survive a late definition (deferred via `whenDefined`, re-applied with the latest value), but a **command-token emit is never replayed** — an emit inside the undefined window is silently dropped. Where the order is out of your hands (autoloader, embedded snippet), gate the emitting control with `<wcs-defined timeout>` on its `pending` output, never with an `await customElements.whenDefined()` inside the handler (that promise never rejects → permanent hang on a failed load).
- **Pre-upgrade property writes are adopted (v1.24+)**: assigning an input on a not-yet-defined element (`el.url = "…"`) used to create an own data property that shadowed the prototype accessor forever — the setter never ran and the value vanished with no error. Every Shell now calls `upgradeProperties(this)` first thing in `connectedCallback`, re-running the declared `wcBindable.inputs` through their setters. Declared inputs only, and the command-token asymmetry above is unchanged.
- **wc-bindable**: each tag declares via `static wcBindable` its **properties** (observable outputs; state subscribes) / **inputs** (write surface; attributes are kebab-case mirrors) / **commands** (invocable methods).
- **Observation semantics (v1.24+)**: every observable property now declares `semantics: "state" | "event" | "handle"` (210 / 20 / 1 across the 41 surfaces inventoried at v1.24). `state` is a *current value* — the same-value guard applies, so writing an `Object.is`-equal primitive skips the set, the dependency walk, the DOM apply and `$updatedCallback`. **`event` properties are occurrences and bypass that guard** (fixed in v1.24 — a repeated identical payload was being swallowed): the same `message` arriving twice now updates state twice. The occurrence outputs, worth knowing because they are the ones where repetition carries meaning:

  | tag | occurrence outputs |
  |---|---|
  | `<wcs-ws>` / `<wcs-sse>` / `<wcs-broadcast>` / `<wcs-worker>` | `message` |
  | `<wcs-clipboard>` | `text` `items` `copied` `cut` `pasted` |
  | `<wcs-notify>` | `clicked` `closed` `shown` |
  | `<wcs-speak>` | `charIndex` `spokenWord` |
  | `<wcs-listen>` | `result` |
  | `<wcs-debounce>` / `<wcs-throttle>` | `fired` |
  | `<wcs-recorder>` | `recorded` `dataavailable` |
  | `<wcs-camera>` | `ended` |
  | `<wcs-midi>` (v1.25+) | `message` `type` `channel` `note` `velocity` `control` `value` — all seven are derived getters over the one `wcs-midi:message` occurrence |
  | `<wcs-audio>` / `<wcs-analyser>` (v1.25+) | `noteOn` `noteOff` / `frame` |

  Everything else — including `error` / `errorInfo` / `loading` / `value` / `trigger` — is `state`. The single `handle` is still `<wcs-camera>`'s `streamReady` (a live `MediaStream`): never route it through state, wire it element-to-element (§2). **`@wcstack/audio` adds zero handles** despite owning a live `AudioNode` graph — the graph is a descriptor, not a value, and the Core owns and disposes it (ADR-14 G2), so the 10 new outputs audio + midi contribute are all `event`.
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
| **fetch** | `<wcs-fetch>` (helpers: `<wcs-fetch-header name value>` `<wcs-fetch-body type>` `<wcs-infinite-scroll>`) | `url`(live: change re-fetches — in-flight aborted. The auto-fetch guard remembers the last url **actually fetched**, not the previous value, so `"a"→""→"a"` is skipped just like `"a"→"a"`; re-running the same url needs an explicit trigger) `method` `target` `manual` `body`(one-shot: consumed per fetch; a mid-flight write stages for the NEXT fetch) `response-type`(auto/json/text/blob/arrayBuffer) `trigger`(no-op while `url` is empty) | `value` `loading` `error` `status` `objectURL` `trigger` | `fetch` `abort` |
| **storage** | `<wcs-storage>` | `key` `type`(local/session) `value` `manual` `trigger` | `value` `loading` `error` `trigger` (with cross-tab sync) | `load` `save` `remove` (all synchronous) |
| **upload** | `<wcs-upload>` | `url` `method` `field-name` `multiple` `max-size` `accept` `manual` `files`(auto-upload fires on `files` write, NOT on `url` change) `trigger` | `value` `loading` `progress` `error` `status` `files` `trigger` | `upload` `abort` |
| **websocket** | `<wcs-ws>` | `url` `protocols` `auto-reconnect` `reconnect-interval` `max-reconnects` `binary-type` `manual` `trigger` `send` (writing a value sends immediately; objects are auto-JSON-serialized). Options besides `url` are read per `connect`; clearing `url` does not disconnect — `close` does | `message` `connected` `loading` `readyState` `trigger` `send` | `connect` `sendMessage` `close` |
| **sse** | `<wcs-sse>` | `url` `with-credentials` `events` `raw` `manual` `trigger`. Options besides `url` apply only via `close`→`connect` (`connect` to the same url is a no-op) | `message` `connected` `loading` `readyState` `trigger` | `connect` `close` (receive-only) |
| **broadcast** | `<wcs-broadcast>` | `name`(live: change reopens the channel) `manual` | `message` (no self-echo; structured clone) | `open` `post` `close` |
| **worker** | `<wcs-worker>` | `src` `type` `name` `manual` `keep-alive`(thread outlives disconnect — caller must `terminate` or it leaks) `restart-on-error` `max-restarts`(cumulative lifetime budget) `restart-interval` | `message` `running` | `start`(no-op while the same `src` runs — `terminate`→`start` to apply option changes) `post` `terminate` |
| **timer** | `<wcs-timer>` | `interval`(default 1000; live while running only — frozen while stopped/paused) `once` `repeat` `immediate` (all read at `start`) `manual` `trigger` | `tick`(counter) `elapsed`(ms) `running` `trigger` | `start` `stop` `reset` `pause` `resume` (`stop`→`start` continues `tick`/`elapsed` — only `reset` zeroes) |
| **raf** | `<wcs-raf>` | `once` `repeat` (read at `start`) `manual` `reduced-motion`(v1.32+: `"pause"`\|`"run"`, default `"run"` — opt-in `prefers-reduced-motion` gate, live-subscribed; while engaged the loop stops and `suspended` reports it; resumes with `dt=0` when the preference clears. Use for motion-for-motion's-sake loops, not functional output) `trigger` | `tick` `elapsed` `dt` `running` `suspended`(two causes: hidden tab, or the reduced-motion gate — counters freeze, `running` stays true) `trigger` — `elapsed` counts active time only, not wall-clock | `start` `stop` `reset` `pause` `resume` (`stop`→`start` continues counters — only `reset` zeroes) |
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
| **midi** (v1.25+) | `<wcs-midi>` | `input`(omitted = every input port; else port id or case-insensitive name prefix) `output`(omitted = first output port) `channel`(1-16; omitted = all — system messages always pass) `sysex`(a separate, more restricted grant — leave off) `auto`(connect + request on connect). `input`/`output`/`channel` are live: they **re-hook the existing access**, never re-request, so no second permission prompt | `message` `type` `channel` `note` `velocity`(**normalized 0-1**) `control`(raw 0-127) `value`(raw 0-127, but **-1..1 for pitch bend**) `devices` `connected` `permission` `granted` `denied` `unsupported` `error` `errorInfo` | `request` `close` `send` |
| **audio** (v1.25+) | `<wcs-audio>` — the patch root | `volume` `limiter`(on by default at -18 dBFS as ear protection; `limiter="off"` to measure real amplitudes) `resume-on-gesture`(default on; `"off"` = drive it yourself with `command.resume`) | `state`(running/suspended/unsupported) `running` `suspended` `unsupported` `voices` `noteOn` `noteOff` `warnings` `error` `errorInfo` | `resume` `suspend` `noteOn(note, velocity)` `noteOff(note)` `allNotesOff` |
| **audio** | node tags `<wcs-osc>`(`type` `frequency` `detune` `glide` `transpose`) `<wcs-noise>` `<wcs-biquad>`(`type` `frequency` `q` `gain` `detune`) `<wcs-gain>`(`gain`) `<wcs-delay>`(`time` `feedback` `mix`) `<wcs-shaper>`(`amount`) `<wcs-env>`(`attack` `decay` `sustain` `release` `depth`) `<wcs-lfo>`(`type` `rate` `depth`) | every numeric attribute above is a bindable input and is **live**; the routing attributes `id` / `out` / `param` / `note` / `master` and `<wcs-voice poly>` are **structural** (a change rebuilds the graph) and are deliberately NOT bindable | none — a node tag is a pure input surface (everything observable belongs to `<wcs-audio>`) | none |
| **audio** | `<wcs-analyser>` | `fft` `smoothing` (+ structural `master`) | `frame` (occurrence — `sample()` returns a **freshly allocated** array, so retaining a frame is safe) | `sample(mode)` — `"wave"` (default) or `"fft"`. It produces data only; drawing is your canvas's job |

### 1.1 `@wcstack/audio` is a graph, not a value (read before writing a patch)

The audio package does not follow the `manual` / `trigger` idioms above — it has a shape of its own:

- **Nesting is the signal chain.** A parent tag's output feeds each nested child; a leaf (no chain children, no `out`) reaches the master output. Anything nesting cannot express is routed by id: `out="bus"` (many-to-one), `out="vcf.frequency"` (drive any `AudioParam`), `param="frequency"` (modulator shorthand for the *parent's* parameter).
- **`<wcs-voice poly="8">` makes its subtree a template** — one fresh graph per held note, with release tails and oldest-note stealing. Outside a voice the graph is live and monophonic.
- **Structure is declared, values are reactive.** Numeric attribute/property writes apply live to every instance including sounding voices; structural attributes (`id` `out` `param` `note` `master` `poly`), and adding/removing/moving an audio tag, **rebuild — which cuts every sounding voice audibly**. Any other DOM change does nothing (a `<div>` added among your sliders must not silence the instrument). Rebuilds coalesce onto a microtask and an unchanged re-submit is free.
- **Writes are accepted synchronously; when they become *audible* is deliberately unspecified** (render quantum + output latency are hardware-dependent). Parameter changes are smoothed over ~20 ms as part of the contract, and the effective value is never read back — a getter returns what you last wrote. This is the cross-cutting rule for any node with an external clock.
- **Audio cannot start before a gesture.** `<wcs-audio>` resumes the shared context on the first click/keypress. The `AudioContext` is shared page-wide (browsers cap concurrent contexts); each root keeps its own master gain and limiter.
- **A voice patch with no `<wcs-env>`** gets an implicit 5 ms attack so it cannot click, and is released on note-off. Voices are reclaimed on the audio clock, never on a timer.
- **Headless**: `new AudioGraphCore()` + `setPatch({nodes:[…]})` takes the same descriptor as a plain object; pass your own `createContext` to render into an `OfflineAudioContext` (no gesture, faster than realtime, deterministic). SSR renders nothing and reports `unsupported`.

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

**Paginate from committed length, not `page++` (v1.26 canonical form; commit boundary moved to `$watch` in v1.27).** `<wcs-intersect>` reports that visibility *changed*; it cannot schedule, and it has no "qualified re-entry" event. `examples/state-intersect-scroll` was rebuilt in v1.26 around a `$streams` entry that owns the page fetch, and the shape it landed on is the one to copy — the older "arm a `<wcs-timer manual once>` from the failure" recipe is superseded:

- **Derive the requested page from committed items** — `page = floor(items.length / pageSize) + 1` — instead of incrementing on each edge. Under `$streams`' switchMap restart a blind `page++` is *wrong*: a second edge would abort page N in flight and jump to N+1, silently skipping a page. With the derived form, edges arriving while page N is active or failed write the same primitive, the same-value guard makes the enqueue a no-op, and the stream does not restart. That replaces the hand-written `if (loading) return` exhaust gate entirely.
- **The producer owns retry.** `$streams` is switchMap, not `retryWhen` — no automatic reconnection. Put a finite `1 + maxRetries` attempt loop and an abort-aware delay inside the async generator; final failure surfaces as `$streamStatus.<name> === "error"` + `$streamError.<name>`.
- **"Run the same page again" is an occurrence, and the restart API is value-based** — encode it as a changing dependency (`retryNonce`) read by `args`. A Retry button increments it. This is a real boundary of the current API, not a workaround you can skip.
- **`reobserve()` only after a successful full page**, never on error: with the sentinel still visible, a new observer's first callback fires immediately, so error layout becomes an infinite retry scheduler. A partial page sets `noMore` instead.
- **A `$watch` commits the page** into the long-lived `items` (a stream's `fold` resets on every restart, so it can only hold the current page). A `$watch` key cannot start with `$`, so mirror the status through a one-line getter — `get streamStatus() { return this["$streamStatus.pageResult"]; }` — and watch *that*: a watched getter is evaluated eagerly, so the commit runs **whether or not anything renders the status**. (Before v1.27 the commit lived in `$updatedCallback`, which is binding-driven — the visible status meter was load-bearing, and deleting one `<b>` stopped the feed. If you must pin ≤1.26, keep a live DOM binding on the stream's value or status.) The stream runtime delivers one `done` per run, so the concat needs no idempotency guard; `commit-before-reobserve` is expressed by statement order inside the watch handler.

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

**defined** — a declarative readiness gate over tags whose load order you do not control (the correct replacement for `await customElements.whenDefined()` in a handler):
```html
<wcs-defined tags="wcs-tilt,wcs-accelerometer" timeout="5000"
  data-wcs="defined: sensorsReady; pending: sensorsPending; missing: sensorsMissing"></wcs-defined>
<button data-wcs="onclick: startGame; disabled: sensorsResolving; textContent: startLabel"></button>
<!-- state side: sensorsPending seeded with the tag list (so the control is held on first paint),
     get sensorsResolving() { return this.sensorsPending.length > 0; } -->
```
Gate on **`pending`**, not `defined`: `timeout` moves a never-arriving tag to `missing`, which releases the control into a degraded mode instead of locking the user out; a late arrival is still promoted out of `missing`, so a merely slow CDN self-heals. Outputs are monotonic and terminal, and all inputs are frozen at connect.

**midi** — one tag covers both directions (a page holds exactly one `MIDIAccess`). Take notes off the occurrence surface, not off a property:
```html
<wcs-midi auto channel="1" data-wcs="eventToken.message: onMidi; control: cc; value: ccValue"></wcs-midi>
<!-- $eventTokens: ["onMidi"],
     $on: { onMidi: (state, ev) => { const { type, note, velocity } = ev.detail; ... } } -->
```
Nothing starts on connect unless `auto` is set — `requestMIDIAccess()` can prompt — so otherwise fire `command.request` from a gesture. Two normalizations are already applied for you: **a note-on with velocity 0 is reported as `noteoff`** (many controllers never send a real note-off; the raw status byte stays in `message.data[0]`), and **velocity is 0-1** so it multiplies straight into a gain. Chromium-only and secure-context-only — elsewhere `permission` is `"unsupported"` rather than a throw. Device names are not unique; prefer ids when targeting a specific unit.

**audio** — structure in markup, numbers from state; commands carry the notes:
```html
<wcs-audio volume="0.7"
  data-wcs="command.noteOn: $command.play; command.noteOff: $command.stop; voices: activeVoices">
  <wcs-voice poly="8">
    <wcs-osc type="sawtooth" note detune="-7" out="vcf"></wcs-osc>
    <wcs-biquad id="vcf" type="lowpass" data-wcs="frequency: cutoff; q: resonance">
      <wcs-lfo type="sine" rate="4" param="frequency" data-wcs="depth: lfoDepth"></wcs-lfo>
      <wcs-env attack="0.01" decay="0.25" sustain="0.55" release="0.35" out="bus"></wcs-env>
    </wcs-biquad>
  </wcs-voice>
  <wcs-gain id="bus" gain="0.8"><wcs-delay time="0.28" feedback="0.35" mix="0.2"></wcs-delay></wcs-gain>
</wcs-audio>
<input type="range" min="80" max="8000" data-wcs="value: cutoff">
<!-- $commandTokens: ["play","stop"];  this.$command.play.emit(60, 0.9) -->
```
Bind only the numeric params (§1.1) — writing a structural attribute from state rebuilds the graph and cuts every sounding voice. To draw a scope, drive `<wcs-analyser>` from `<wcs-raf>` through the command/event tokens rather than owning a rAF loop:
```html
<wcs-raf data-wcs="eventToken.tick: onTick"></wcs-raf>
<wcs-analyser id="scope" master
  data-wcs="command.sample: $command.grab; eventToken.frame: onFrame"></wcs-analyser>
```

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
  import { signal, computed, effect, h, render, For, bindNode, mountNode } from "@wcstack/signals/dom";
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

**`bindNode` is synchronous, so the class must already be registered when you call it** — it reads the descriptor from `el.constructor.wcBindable`, and an un-upgraded element has none (it throws). This is the structural asymmetry with `data-wcs`: the declarative layer can defer wiring until upgrade, an imperative API that returns values now cannot. Pick the idiom by who loads the node (v1.23+, `docs/signals-definition-timing.md`):

| Situation | Idiom | Failure behavior |
|---|---|---|
| App loads a **required** node | side-effect `import "@wcstack/<pkg>/auto"` + `mountNode(tag)` | module-graph evaluation failure — loud, correct for a node the app cannot run without |
| App loads an **optional** node | `import("@wcstack/<pkg>/auto").then(() => mountNode(tag)).catch(degrade)` | `import()` **rejects** on load failure — a real per-package failure boundary |
| A tag **you do not load** (autoloader, mixed state+signals page, third-party script) | `await customElements.whenDefined(tag)` then `bindNode(el)`, or a `<wcs-defined>` gate | `whenDefined` **never rejects** — pending forever; use `<wcs-defined timeout>` when the UX needs a failure signal |
| Pure-logic node, **JS only** (no element, no `:state()`, no state coexistence) | `bindNode(new XxxCore())` | plain import semantics — **the registry is not involved, so definition timing does not exist** |

`whenDefined` is the last resort for tags you do not own, not the default recipe — as of v1.26 no `whenDefined` call remains in any repo demo. **Split static vs dynamic import by what is lost when that import fails**, not by convenience: the first pass at converting `signals-tilt-maze` put `wakelock` on the static import, and one decorative package's CDN failure blanked the entire page again — exactly the failure mode the conversion was meant to remove. Only a node the app cannot exist without belongs on a static import; everything else takes the `import().then(mountNode).catch(degrade)` form (with a `Promise.race` timeout if the UX needs a deadline).

### `mountNode` — create + bind + mount a headless node (v1.23+, `@wcstack/signals/dom`)

```js
import "@wcstack/fetch/auto";                 // defines <wcs-fetch>; the module graph guarantees the order
import { mountNode } from "@wcstack/signals/dom";

const fetcher = mountNode("wcs-fetch", { attrs: { url: "/api/people" } });
fetcher.signals.value.get();                  // the full BoundNode surface
fetcher.el;                                   // the created element (connected)
fetcher.unmount();                            // dispose() + remove the element (idempotent)
```

On a buildless page the side-effect import is what carries the ordering guarantee, so it has to be a real `import` inside the module — add `"@wcstack/fetch/auto": "https://esm.run/@wcstack/fetch/auto"` to the import map (or import the full URL directly). A `<script src=".../auto">` tag in `<head>` also works because module scripts execute in document order, but then the guarantee lives in the HTML rather than in the module graph.

Signature: `mountNode(tagName, { attrs?, parent?, descriptor? })` → `BoundNode & { el, unmount() }`. The internal order **is** the contract: create → set `attrs` → `bindNode` → connect. Attributes land before `connectedCallback` (shells read their config there) and the adapter subscribes before connect, so an event fired from `connectedCallback` cannot be missed. `attrs` follow HTML boolean semantics (`true` → empty attribute, `false` → omitted, everything else stringified); `parent` defaults to `document.body`; the tag name is lower-cased for you. An undefined tag throws a descriptive error immediately instead of hanging. Like `bindNode` it is not tied to a reactive owner — tear down explicitly, or compose `onCleanup(() => m.unmount())`. On a `MountedNode`, **`dispose()` is an alias of `unmount()`** (it owns the element's lifecycle, so the familiar verb never leaves a connected element with live I/O behind).

### Binding a Core directly — no element at all (v1.23+ normative)

Every I/O node splits into a framework-agnostic **Core** and a custom-element **Shell**, and the Core alone is a complete wc-bindable node: it extends `EventTarget`, dispatches on itself by default (`constructor(target?)`, `target ?? this`), exposes observables as public getters, and carries `static wcBindable` — so `bindNode` resolves the descriptor with no second argument:

```js
import { FetchCore } from "@wcstack/fetch";
import { bindNode } from "@wcstack/signals/dom";

const core = new FetchCore();
const bound = bindNode(core);   // descriptor from FetchCore.wcBindable — no element involved
core.fetch("/api/user");        // commands are plain methods
bound.signals.value.get();
```

This surface is normative across every wcstack I/O node (`docs/async-io-node-guidelines.md` §3.9 — audited at 38 Cores, zero deviations; the audit predates v1.25's `AudioGraphCore` / `MidiCore`, both of which ship the same shape) and semver-protected: entry export, `EventTarget` inheritance, self-dispatch default, `static wcBindable`, getter-readable observables, `observe()`/`dispose()`/`ready`, never-throw, and headless construction (`target` always optional). Constructor **config** arguments stay per-package — check that package's README. Trade-off: you drive the lifecycle yourself (`observe()`/`dispose()` or the start/stop commands, e.g. `onCleanup(() => core.dispose())`), and you give up attribute config plus `:state()` CSS reflection (a Shell/ElementInternals feature). Fits pure-logic nodes (fetch / websocket / sse / broadcast / timer / debounce / defined / raf …); element-coupled nodes (intersection & resize targets, camera preview, fullscreen / pip / pointer-lock) keep earning their Shell.

### Stability

The core (signal/computed/effect/createRoot/onCleanup/flushSync) and resource/streamResource are **Stable**. `bindNode`/`nodeSource` and the DOM layer (h/For/Index/SignalsElement/`mountNode`) are **Evolving** (may change in minor releases).
