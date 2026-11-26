# wcstack-skill

An [Agent Skill](https://code.claude.com/docs/en/skills) that gives AI coding assistants (Claude Code and compatible tools) expert knowledge of building web apps with [wcstack](https://github.com/wcstack/wcstack) — `@wcstack/state`, `@wcstack/router`, `@wcstack/signals`, and the `wcs-*` I/O node components.

With this skill installed, asking your AI assistant to "build an app with wcstack" produces apps with correct `data-wcs` binding syntax, proper CDN loading, and the project's standards-first, zero-config, buildless conventions — instead of hallucinated APIs.

## What's inside

```
skills/wcstack-app/
├── SKILL.md                          # Workflow, invariants, cheat sheet, the most
│                                     #   frequent failures
└── references/
    ├── state-binding.md              # Full data-wcs syntax, comment bindings, filters,
    │                                 #   delegated events + #direct, command-/event-tokens,
    │                                 #   $behavior, $watch, spread rules, $recursion / **,
    │                                 #   accumulation over time, keyed selection ($eq*),
    │                                 #   split entries, 3.x code, the pitfall checklist
    ├── router-and-scaffold.md        # SPA routing, layouts, guards, autoloader,
    │                                 #   index.html skeleton + SPA server fallback
    ├── io-node-catalog.md            # wcBindable catalog of 52 wcs-* tags
    │                                 #   + signals quick reference
    ├── forms.md                      # a page that is mostly a form: the IME, fields that
    │                                 #   format, autofill, reset, rows, own form controls
    ├── long-lists.md                 # a long list: infinite scroll, a filter and a page on
    │                                 #   its way, rows, a window of rows, coming back
    ├── device-apis.md                # the screen and the sensors: a tap, is it there, the
    │                                 #   iPhone's question, fullscreen, pickers, passwords
    ├── islands.md                    # a page wcstack does not own: htmx / Turbo,
    │                                 #   inserted markup, history caches, widgets
    ├── frameworks.md                 # wcs-* elements in a React / Vue / Svelte / Solid app
    ├── verification.md               # the lint in depth, wcs-schema / wcs-tsc, console
    │                                 #   messages, DevTools, headless tests, SSR
    └── versions.md                   # a page pinned to an older 4.x release
```

The skill uses progressive disclosure: `SKILL.md` stays small — the workflow, the invariants and the most frequent failures, about 20 KB — and the references load only when the matching phase is reached. Keep it that way when adding to the skill:

- New knowledge goes into the reference of its area (a failure into that reference's pitfalls), not into `SKILL.md`. `SKILL.md` names a failure only if authors of most apps meet it.
- The skill describes one release, the one in its stamp. Write a behaviour as it is in that release, with no "since 4.x" / "up to 4.x" notes; what a page pinned to an older 4.x release does differently goes in `references/versions.md`.

## Install

### As a Claude Code plugin (recommended)

```
/plugin marketplace add wcstack/wcstack-skill
/plugin install wcstack-app@wcstack
```

The plugin also runs the lint for Claude, so the skill's completion gate does not depend on Claude remembering it (`hooks/`):

- **After Claude writes a wcstack page.** This covers an `.html` with `data-wcs`, a `wcs-*` tag or a wcstack script, and a `wcstack.manifest.json`. `wcs-validate` checks the page, and Claude gets its errors to fix and its warnings as information: each warning can be a real defect, and a false one is explained, not "fixed".
- **When Claude stops.** The pages written in the session are checked again, and errors that are left are reported to you. Set `WCSTACK_LINT_GATE=enforce` to have the stop refused while errors remain. A stop right after a refusal goes through, and after two refusals in a session every stop does.
- **Running and switching it off.** The hooks use the project's `wcs-validate` if it is installed, otherwise `npx @wcstack/lint`. They never block when the lint cannot run. `WCSTACK_LINT_HOOK=off` turns them off.

A manual copy of the skill has no hooks.

#### Updating

Claude Code does not update a plugin from a third-party marketplace on its own: auto-update is off by default for every marketplace but Anthropic's, and an install keeps the version it got. A copy installed for an older release goes on teaching that release's API (a 2.x install describes `$updatedCallback` and `$streams`, which 4.0 removed). To update:

```
claude plugin marketplace update wcstack
claude plugin update wcstack-app@wcstack
```

then `/reload-plugins` in a running session. To keep it current, turn auto-update on for the marketplace: `/plugin` → **Marketplaces** → `wcstack`. `/plugin` → **Installed** shows the version you have; the skill's `metadata.wcstack-version` says the wcstack release it describes.

To pin the skill to the release your pages use, add the marketplace at that tag: `/plugin marketplace add wcstack/wcstack-skill#v4.30.0`. An article or a tutorial written against one release can tell its readers to do this, so they get the skill it was written with.

### Manual copy

Copy `skills/wcstack-app/` into:

- `~/.claude/skills/wcstack-app/` — personal, available in every project, or
- `<project>/.claude/skills/wcstack-app/` — project-scoped.

## Versioning

The plugin version tracks the wcstack release the content was last verified against (currently **4.30.0**). The `SKILL.md` frontmatter carries the same stamp as `metadata.wcstack-version`.

Pages that must stay on wcstack 3.x pin the major in their CDN URLs (`https://esm.run/@wcstack/state@3/auto`) and use a skill release verified against 3.5.4 (the `v3.5.4` tag of this repository).

## Ground truth & contributions

The [wcstack monorepo](https://github.com/wcstack/wcstack) (package READMEs, `examples/`, `docs/`, and source) is the ground truth; [wcstack.github.io](https://wcstack.github.io) is the project landing page. When wcstack protocols change — `data-wcs` syntax, `wc-bindable` / command-token / event-token, router attributes — the references here must be updated to match. PRs that fix drift against a released wcstack version are welcome.

## License

[MIT](LICENSE)
