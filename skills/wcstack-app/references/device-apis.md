# Screen and sensor APIs

A page that uses what the device has: fullscreen, a small video window (Picture-in-Picture), the pointer lock, the screen's orientation, which way the phone points and how it moves, the share sheet, the contact picker, saved passwords, the eye dropper. Sources: `docs/device-apis.md` (+ `.ja.md`), the READMEs of `fullscreen`, `picture-in-picture`, `pointer-lock`, `screen-orientation`, `tilt`, `accelerometer`, `gyroscope`, `magnetometer`, `ambient-light-sensor`, `share`, `contacts`, `credential`, `eyedropper`, `permission`, `docs/timing-and-firing-contract.md` §8, §9, §16, §27. Written from the `stamp-rally` seam app; what is said about a phone was checked with stand-ins, not on a phone.

Three things hold for all of them: every one is missing on some device, every one that acts wants a tap, and none of them throws — a refusal is a value in `error` / `errorInfo`.

## 1. A tap

Fullscreen, Picture-in-Picture, the pointer lock, the share sheet, the pickers and the iPhone's sensor question are given only while the page handles a tap, a click or a key press. Chromium keeps a tap's activation about five seconds — so a page that emits late works on a fast network and fails on a slow one.

- Emit in the tap's handler, before anything is awaited. `onclick: $command.x` and a state method that emits synchronously are both inside the event.
- Do not emit from a `$watch`, when a response arrives, or after an `await`. Prepare what the command needs beforehand (make the picture when the card is shown, not in the tap) and disable the button until it is ready.
- A command for an element the same update renders has nothing to act on yet (a `<wcs-fullscreen>` whose `target` is in an `if:` the handler just opened): emit after the render.
- **A command that takes data is emitted from a state method.** `onclick: $command.share` passes the event as the data: `share(event)`, `select(event)`, `lock(event)` end in the browser's `TypeError`, `<wcs-credential>`'s `get(event)` resolves `null` without a word (lint `wcs/command-event-argument`, 4.25). Commands with no data — `requestFullscreen`, `start`, `open` — and `<wcs-fetch>`'s `fetch`, `<wcs-ws>`'s `close`, `<wcs-idle>`'s `start` (4.25) can be wired straight.

```js
$commandTokens: ["share"],
shareCard() {                               // in the tap
  this.$command.share.emit({ files: [this.cardFile], text: "…" });
},
```

## 2. Failures

Bind `errorInfo` on every element whose command the user triggers, and show something for it. `errorInfo.code`: `capability-missing` (the API is not there — offer the fallback), `not-allowed` (refused: no tap, a policy, a permission), `invalid-argument` (a `target` that names nothing), and the element's own code. `cancelled` is separate: the user closing the share sheet, the eye dropper or the contact picker is not a failure — show nothing.

```html
<wcs-share data-wcs="command.share: $command.share; cancelled: shareCancelled; errorInfo: shareError"></wcs-share>
<p role="alert" data-wcs="hidden: shareError|not">共有できませんでした。</p>
```

Since 4.25 the `diagnostics` add-on (in `/auto`) warns `[wcs/io-error-unobserved]` when an element reports a failure and its `data-wcs` reads none of `error`, `errorInfo`, `status`, `connected` and has no event token. Up to 4.24 such a failure was silent.

## 3. Is it there?

Since 4.25 each of the thirteen elements has a `supported` output: this page can use the feature — the API is there and no `Permissions-Policy` or `<iframe>` forbids it. Offer the button only when it is true (`hidden: fsSupported|not`). It is read when the binding attaches, so the first paint is right. On a page pinned to 4.24 or earlier there is no `supported`: detect by hand (`document.fullscreenEnabled`, `typeof EyeDropper`).

Where it is `false`: fullscreen on an iPhone (no element fullscreen), Picture-in-Picture in Firefox, the share sheet on most desktops, the eye dropper and saved passwords outside Chromium, the contact picker outside Android and in any frame, the Generic Sensor classes with no `devicemotion` beside them.

It does **not** say the user will allow it, that an orientation lock will hold (known only by trying, in fullscreen), or that the device has a sensor (a desktop has the events and never a reading: treat "no reading a moment after `start`" as "not here").

`<wcs-permission>` says `unsupported` for both "the browser cannot say" and "the page is forbidden"; since 4.25 `unsupportedReason` tells them apart: `policy-blocked` (tell the user to open the page itself in a new tab), `insecure-context`, `no-permissions-api`, `unknown-name` (Firefox and Safari reject the sensor names — it does not mean the feature is absent).

## 4. The iPhone's sensors

Safari on iOS gives no orientation or motion reading until the user allowed it, asks only from a tap, and asks separately for orientation (`<wcs-tilt>`) and motion (`<wcs-accelerometer>` / `<wcs-gyroscope>`, which read `devicemotion` there since 4.25). One token asks every question and one starts every sensor:

```html
<wcs-tilt data-wcs="permissionState: tiltPermission; heading: heading; errorInfo: tiltError;
                    command.requestPermission: $command.ask; command.start: $command.start"></wcs-tilt>
<wcs-accelerometer data-wcs="errorInfo: motionError; eventToken.x: moved;
                    command.requestPermission: $command.ask; command.start: $command.start"></wcs-accelerometer>
<button data-wcs="onclick: allow">許可する</button>
```

```js
$commandTokens: ["ask", "start"],
$eventTokens: ["moved"],
allow() { this.$command.ask.emit(); this.$command.start.emit(); },   // both in the tap, nothing awaited
```

- Never start the sensors at page load with nothing for the question: on an iPhone no reading ever arrives, and nothing says why.
- A question asked outside a tap is refused without being shown: `errorInfo.code` `not-allowed`, `recoverable: true`, and since 4.25 `permissionState` stays as it was (up to 4.24 it said `"denied"` — do not tell the user they refused). `"denied"` is the user's answer; Safari then does not ask again.
- After a reload `permissionState` is `"unknown"` again; a page that wants to remember keeps its own note.
- **North** is `<wcs-tilt>`'s `heading` (4.25; degrees clockwise from north, `null` until known). `alpha` is relative on both phone platforms — never turn a compass by it. Show the direction as text while `heading` is `null`.
- On a page pinned to 4.24 or earlier: `<wcs-accelerometer>` / `<wcs-gyroscope>` are `capability-missing` on an iPhone and there is no `heading` — a hand-written `devicemotion` / `deviceorientationabsolute` listener is needed there.

## 5. Fullscreen, the lock, the small window

- Bind `active`. Do not keep "is it fullscreen" as a flag the buttons flip: the user leaves with Escape, a swipe or the window's ×, and the flag does not know.
- Never assign the bound path (`this.isFullscreen = true` fills no screen — lint `wcs/output-path-written`): ask the element with its command.
- `target` is a CSS selector: `target="#viewer"`, not `target="viewer"` (lint `wcs/target-selector`).
- Hold the screen in landscape from a `$watch` on the path bound to `active` — `true` → emit `lock` with `"landscape"`, `false` → emit `unlock` — never in the handler that requests fullscreen (it is not active yet).
- **What must go on across pages lives outside the router.** A route's content is taken out of the document on leaving: the browser ends fullscreen and the pointer lock, and a video in Picture-in-Picture belongs outside the routes with its `<wcs-pip>`, hidden with a class where it is not shown (Chromium keeps a removed video playing, so the mistake does not show there). Since 4.25 the element reports `active: false` as it leaves; up to 4.24 state kept `true`.

## 6. Sensors that keep running

No sensor element starts on connect, a disconnect stops it, and nothing starts it again when its route comes back: emit `start` when the page that needs it is shown and `stop` when it is not (a `$watch` on the route), and stop on a hidden tab (no element reports visibility — `docs/long-lived-pages.md`). Do not bind every reading into state and draw a list from it: take the readings in an event-token handler (`event.detail` is the whole reading, `{ x, y, z }`) and write a path only when what is shown changes. `frequency` is a positive number of Hz (`"60hz"` means the default rate; lint `wcs/frequency-invalid`).

## 7. Pickers and saved passwords

- **contacts**: every member of a result is an array (`name: ["山田 花子"]`, possibly empty). Give `value` a slot of its own and make your own records from it in a `$watch` — never bind it into a list the page keeps (`value` is an output: at bind the element's `null` replaces what the path had). A picker closed without a choice is `cancelled` (4.25; up to 4.24 it wrote `value: []`).
- **credential**: store the pair only after the server accepted it (`store({ id, password })`, 4.25; before, build `new PasswordCredential(…)` behind a `typeof` check). On sign-out emit `preventSilentAccess` (4.25; before, call `navigator.credentials.preventSilentAccess()` by hand) or the next visit signs the user back in. Keep the plain form in a shape a password manager fills.
- **share**: ask `canShare({ files })` (a method of the element) before handing over a file; fall back to the text and the link, then to copying the link.

## 8. Testing

Stand-ins: Chromium's DevTools protocol for sensor readings (`Emulation.setSensorOverrideEnabled` / `setSensorOverrideReadings`); `page.addInitScript` scripts for the iPhone's question, the share sheet and the pickers, which answer only with `navigator.userActivation.isActive`. A call that is "not a tap" must come from the page's own timer on a page the test has not touched: Playwright's clicks, `page.evaluate()` and the polling behind `expect(locator)` all count as user activation. Headless Chromium's `screen.orientation.lock()` resolves and changes nothing; Escape does not leave fullscreen there.
