# Forms — a page that is mostly a form

Sources: `docs/forms.md` (+ `.ja.md`), `packages/state/README.md` "Forms: what happens outside the `input` event" and "Two-Way Binding", `packages/state/src/features/forms.ts`, `docs/timing-and-firing-contract.md` §25, `packages/fetch/README.md`, `docs/seam-apps.md` (ekiden-entry). Verified against wcstack 4.23.0; every snippet here was run in Chromium.

Read this before building an application form, an entry sheet or a wizard: text typed with an IME (Japanese, Chinese, Korean), fields that format what is typed, autofill, a reset button, rows of inputs that move, form controls of your own.

## 1. What `@wcstack/state` does (4.23, the `forms` add-on)

In `/auto`, `.` and the `wcstack/auto` bundle; a split page installs `@wcstack/state/features/forms`. On a page pinned to 4.22 or earlier none of this happens, and each case below goes wrong without a word.

- **A field being composed is not written.** While an IME composition is on, the bindings that write the field's `value` wait, and are applied when it is over with the value state has then. So a setter may normalize what is typed, and a write from elsewhere (another tab's draft, a looked-up address) does not break the composition.
- **A value with no `input` event reaches state**: on `change` (an autofill that fires `change` alone), and for each field of a form before its `submit` handlers run (a value put in silently).
- **After a reset** (`<button type="reset">`, `form.reset()`) each bound control writes its reset value to state and is written from state again.
- These are told to state by an `input` (and `change`) event that does not bubble, dispatched on the control: a delegated `oninput:` handler does not run for them.

## 2. Text composed with an IME

- A two-way binding writes every composition step to state. Code that must see finished text only: `if (e.isComposing) return;` in the `oninput:` handler, and `oncompositionend:` for the final text.
- **Enter confirms a conversion and reaches your `keydown` handler.** Always:

```js
onKey(e) {
  // 229: Safari sends the confirming Enter after compositionend, with isComposing already false
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
  this.next();
}
```

- **A reading (フリガナ) field** takes the kana from `compositionupdate` — once converted, the field's value is the kanji and the reading is gone:

```html
<input data-wcs="value: name; oncompositionupdate: reading; oncompositionend: readingEnd">
<input data-wcs="value: kana">
```

```js
name: "", kana: "", _reading: "",
reading(e) { if (/^[ぁ-ゖァ-ヺー]+$/.test(e.data)) this._reading = e.data; },
readingEnd() {
  this.kana += this._reading.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  this._reading = "";
},
```

- Tests: a real composition can be driven in Chromium only (CDP `Input.imeSetComposition` / `Input.insertText`). happy-dom has no IME — dispatch `compositionstart` / `compositionend` yourself.

## 3. A field that changes what is typed

- **Normalize in a setter** — `get phone()` formats, `set phone(v)` keeps the digits. Not on every keystroke in a handler that rewrites the field.
- **Never an output filter on a two-way field** (`value: price|locale`, `value: code|upper`): the field is rewritten on every keystroke, and state receives the formatted text. Lint `wcs/two-way-output-filter`. Show the formatted value in another element.
- **The caret goes to the end** when a write changes the field's text. For a field edited in the middle, write back on commit: `value#onchange: phone`. To format while typing and keep the caret, bind one way and write the field yourself:

```html
<input data-wcs="value#ro: phone; oninput: typePhone">
```

```js
typePhone(e) {
  if (e.isComposing) return;
  const el = e.target;
  const digitsBefore = el.value.slice(0, el.selectionStart).replace(/\D/g, "").length;
  this.phoneDigits = el.value.replace(/\D/g, "");
  const text = this.phone;
  el.value = text;
  let i = 0;
  for (let seen = 0; i < text.length && seen < digitsBefore; i++) if (/\d/.test(text[i])) seen++;
  el.setSelectionRange(i, i);
}
```

- **An input filter converts on the way in only** (`value|trim: name`): state gets the trimmed text, the field stays as typed.
- **Numbers**: an element's `value` is a string — `count + 1` is `"51"`. `valueAsNumber: count` (number, range, date and time types) or `value|number: count` (`|int`, `|float`). Lint `wcs/number-written-as-string`. An emptied `valueAsNumber:` field gives `NaN`; `value|number:` gives `0`.

## 4. Values the user did not type

- Give each field a `name` and an `autocomplete` token, inside a `<form>`.
- **Send from the form's `submit` handler**, with the step's button as the submit button: a value put in with no event is told to state right before that handler, not before.
- **Send what state holds**, never `new FormData(form)`: the page holds only the step that is rendered.
- A reset takes the markup's defaults. A radio group with no `checked` radio in the markup has no reset value: state keeps its value and the radio shows it again. When the defaults live in state, write a `clear()` method and a plain button.

## 5. Rows of inputs

- **Reorder the objects** (`this.rows = [b, a, ...rest]`, the same objects): focus, an open `<details>`, a chosen file and a composition travel with the row (Chromium 133+, Firefox 144+; Safari re-inserts the row and the field loses the focus — `element.focus()` after).
- **Never exchange the values between rows**: what the elements hold stays at the position.
- **A list rebuilt from JSON needs `$listKeys`**, or every row is re-created.
- **A row's radios need a name per row**: `attr.name: .sexGroup` with `get "runners.*.sexGroup"() { return "sex-" + this[".id"]; }`. A literal `name` makes one group of all the rows (lint `wcs/radio-name-shared`).
- **Keep a server's errors by the row's id** (`errorsById[runner.id]`), not by index.
- **`<wcs-upload>` / `<wcs-fetch>` in a row that moves**: since 4.23 the request goes on where the browser moves the row with `moveBefore()` (Chromium, Firefox). In Safari the row is taken out and put back and the request is aborted: do not reorder while a row's request is in flight, or keep the I/O elements in a list that does not move.

## 6. Steps (a wizard)

- **Render a step with `if:` or a route; never hide it.** A hidden step's `required` fields make the browser refuse the submit, with nothing shown. Validate the whole entry in state before the last send.
- **Focus a field of the next step after it is rendered**: emit the focus command from `$renderedCallback`, or when the router's `path` changes. Emitted with the step change it is lost (`[wcs/command-token-unbound]`).
- **A `422` naming a field of another step**: keep errors in state by field, go to the first step that has one, focus once it is rendered.
- **A guard that shares code with the page** imports a full URL inside the function — `await import(new URL("/js/guards.js", location.href).href)` — or an import-map name: a guard is a `blob:` module, and `"./guards.js"` does not resolve.

## 7. Form controls of your own

A form-associated custom element (`static formAssociated = true`) binds like any wc-bindable element — with `value` in **both** lists:

```js
class MidoriStepper extends HTMLElement {
  static formAssociated = true;
  static wcBindable = {
    protocol: "wc-bindable", version: 1,
    properties: [{ name: "value", event: "midori-stepper:change" }],
    inputs: [{ name: "value" }],
  };
  #internals = this.attachInternals();
  #value = 0;
  get value() { return this.#value; }
  set value(v) { this.#set(Number(v) || 0); }               // from state or script: no event
  #set(v) { this.#value = v; this.#internals.setFormValue(String(v)); this.#render(); }
  #changed(v) {                                              // from the user: tell
    this.#set(v);
    this.dispatchEvent(new CustomEvent("midori-stepper:change", { detail: v, bubbles: true }));
  }
  formResetCallback() { this.#changed(0); }
  formStateRestoreCallback(state) { this.#changed(Number(state) || 0); }
  #render() { /* draw the value */ }
}
```

- `value` in `properties` only: state never writes the control, and its first value replaces state's — a saved draft is lost as the page loads. In `inputs` only, or with no declaration: what the user enters never reaches state. Since 4.23 the diagnostics warn (`[wcs/form-control-one-way]`); the lint does not read a class in another file.
- Dispatch the event on the user's change, on a reset and on a restore. A setter for every input: state writes properties, not attributes.

## 8. Sending

```html
<form data-wcs="onsubmit: send">…</form>
<wcs-fetch url="/api/entries" method="POST" manual data-wcs="body: payload; trigger: sending; error: sendError"></wcs-fetch>
```

```js
send(e) {
  e.preventDefault();
  this.payload = { ...this.entry };      // a new object each time
  this.sending = true;                   // after body: bindings apply in the order written
}
```

- **`body` before `trigger`**, in the `data-wcs` and in the method. A `command.fetch:` runs at once, before the bindings of the same update: its request carries the body the element had before.
- **A body is sent once.** Writing the same string again is no change, so a retry goes out with no body — write a new object each time. Since 4.23 `<wcs-fetch>` warns (`[wcs/fetch-body-gone]`).
