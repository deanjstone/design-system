# ADR-0003: Link Kind is detected from the href's scheme

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** Director (approved in chat)
- **Resolves:** [How is a link's kind modelled and detected?](https://github.com/deanjstone/design-system/issues/74), on [Map: LinkPill](https://github.com/deanjstone/design-system/issues/71)

## Context

LinkPill renders a link as an inline pill whose look depends on its **Link
Kind** (see `GLOSSARY.md`). Four surfaces need it: myargus reader articles,
the myargus knowledge app, streaming agent chat, and slate-reader Markdown
notes. Earlier decisions on the map fixed the shape of the build:

- A **framework-agnostic core** with thin React, Preact and HTML-string
  shells ([Can slate-reader's Preact legacy build consume a React registry
  component?](https://github.com/deanjstone/design-system/issues/72)).
- **One renderer per surface.** slate-reader's server-side `marked`
  `renderer.link` and a myargus React `components.a` hook both call the same
  core ([Which markdown renderer serves streaming React chat and Safari 9
  Preact notes?](https://github.com/deanjstone/design-system/issues/73)).

So the core has to decide the kind from what every renderer can hand it: a
plain href from `[text](url)` or `<a href>`. A survey on 2026-10-10 found no
myargus route for agents, sessions, people, files or vault notes, and no custom
URL scheme in either consumer repo. **There is no existing URL shape for
Mention Targets to pattern-match against.**

## Decision

**Link Kind is a pure, synchronous function of the href, decided mostly by its
scheme.** `classify(href)` checks, in order:

1. **Mention:** `mention:<type>/<id>`, where `<type>` is one of `agent`,
   `session`, `note`, `memory`, `person`. For example `mention:agent/tex` or
   `mention:note/<vault path>`. An unknown `<type>` is not a Mention.
2. **Location:** `geo:` ([RFC 5870](https://www.rfc-editor.org/rfc/rfc5870)) only.
3. **File:** an absolute http(s) href whose path ends in a document or asset
   extension (`.pdf`, `.zip`, `.csv`, `.png`, …).
4. **URL:** any other absolute http(s) href.
5. **None:** everything else, i.e. `#anchors`, relative paths, `mailto:`,
   `tel:`, unknown mention types and malformed hrefs. These render as a
   **Plain Link**, an ordinary `<a>`, not a pill.

Kind is never read from the title attribute, never decided by a
consumer-supplied resolver callback, and never inferred from a host table.
The only rule that looks past the scheme is the file-extension rule.

## Rationale

**Purity is what lets one core serve three shells.** Server-side HTML
rendering, token-by-token streaming and a Safari 9 Preact client can all call
a synchronous function of a string. A callback or async lookup would split the
core's behaviour by surface, and the Plain Link fallback would stop being
something an old client can rely on.

**A scheme is the only signal that exists today.** Mention Targets have no
routes, so a host/path table would have to invent URLs first and then be
maintained in every consumer.

**One `mention:` scheme over one scheme per target.** Each sanitiser allowlists
a single scheme, and adding a Mention Target type later touches neither
`sanitize-html` nor DOMPurify. Short per-target schemes like `note:` also
risk colliding with schemes other tools register.

**Memory is its own Mention Target, separate from Note.** A Memory carries
typed frontmatter a pill may surface, which justifies its own resolver even
though both are vault files.

## Consequences

**This is hard to reverse.** Agent prompts will be taught to emit
`mention:<type>/<id>`, and stored content (memories, notes, chat history)
will carry it. Renaming the scheme or the type names later means migrating
that content and retraining the agent conventions.

**Both sanitisers must allow `mention:` and `geo:`.** slate-reader's
`sanitize-html` uses the default `allowedSchemes` (http, https, ftp, mailto,
tel) and would strip them. myargus's DOMPurify config has to allow them too.
Sanitising still runs after rendering.

**Pasted map links are not Locations.** A Google or Apple Maps URL stays a URL
pill. Location pills only appear where something deliberately emits `geo:`.

**Unknown or malformed mentions degrade quietly** to Plain Links. That makes
adding a type forward-compatible, but it also hides authoring mistakes. Whether
agents need a validation step is open as [How do agents author Mention links
in their output?](https://github.com/deanjstone/design-system/issues/81).

## Alternatives considered

**Scheme plus a host/path table.** Promote known https URLs (e.g.
`myargus.cc/knowledge/entity/:id`, map hosts) into kinds. Rejected because the
table would live in every consumer and drift, and Mention Targets have no
routes to match yet.

**Consumer-supplied resolver callback.** The most flexible option. Rejected
because the core would then guarantee nothing, and the three shells could
classify the same href differently.

**Kind in the title attribute** (`[text](url "mention")`). Needs no new
scheme. Rejected because it overloads the tooltip and LLMs emit it
unreliably.

**Literal `file:` URIs for File links.** Rejected because browsers refuse to
open `file:` from a web page, so the kind would almost never appear in real
content.
