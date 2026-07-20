# wcstack-skill

An [Agent Skill](https://code.claude.com/docs/en/skills) that gives AI coding assistants (Claude Code and compatible tools) expert knowledge of building web apps with [wcstack](https://github.com/wcstack/wcstack) — `@wcstack/state`, `@wcstack/router`, `@wcstack/signals`, and the `wcs-*` I/O node components.

With this skill installed, asking your AI assistant to "build an app with wcstack" produces apps with correct `data-wcs` binding syntax, proper CDN loading, and the project's standards-first, zero-config, buildless conventions — instead of hallucinated APIs.

## What's inside

```
skills/wcstack-app/
├── SKILL.md                          # Workflow, cheat sheet, silent-failure matrix
└── references/
    ├── state-binding.md              # Full data-wcs syntax, 40 built-in filters,
    │                                 #   command-/event-tokens, spread rules
    ├── router-and-scaffold.md        # SPA routing, layouts, autoloader,
    │                                 #   index.html skeleton + SPA server fallback
    └── io-node-catalog.md            # wcBindable catalog of 35 wcs-* tags
                                      #   + signals quick reference
```

The skill uses progressive disclosure: `SKILL.md` stays small (workflow + invariants) and the references load only when the matching phase is reached.

## Install

### As a Claude Code plugin (recommended)

```
/plugin marketplace add wcstack/wcstack-skill
/plugin install wcstack-app@wcstack
```

### Manual copy

Copy `skills/wcstack-app/` into:

- `~/.claude/skills/wcstack-app/` — personal, available in every project, or
- `<project>/.claude/skills/wcstack-app/` — project-scoped.

## Versioning

The plugin version tracks the wcstack release the content was last verified against (currently **1.21.7**). The `SKILL.md` frontmatter carries the same stamp as `metadata.wcstack-version`.

## Ground truth & contributions

The [wcstack monorepo](https://github.com/wcstack/wcstack) (package READMEs, `examples/`, and source) is the ground truth. When wcstack protocols change — `data-wcs` syntax, `wc-bindable` / command-token / event-token, router attributes — the references here must be updated to match. PRs that fix drift against a released wcstack version are welcome.

## License

[MIT](LICENSE)
