# design-system

Shared component registry and design tokens for the myargus and slate-reader surfaces.

## Language

### Link pills

**Link Pill**:
A link rendered inline as a compact, tinted chip that shows what kind of thing it points at.
_Avoid_: Chip, badge, tag, link card

**Link Kind**:
The category a link falls into, decided from its href alone: Mention, Location, File, URL, or None.
_Avoid_: Link type, link variant

**Mention**:
A Link Kind that points at something inside the Argus ecosystem rather than at a web page.
_Avoid_: Reference, tag, @-link

**Mention Target**:
The type of thing a Mention points at: an Agent, a Session, a Note, a Memory, or a Person.
_Avoid_: Entity, subject

**Agent**:
A named, persistent agent identity, such as Tex.
_Avoid_: Bot, assistant

**Session**:
One run of an agent, with its own title and status.
_Avoid_: Conversation, chat, thread

**Note**:
A vault page that isn't a Memory.
_Avoid_: Page, doc, entry

**Memory**:
A typed agent-memory entry in the CONTEXT vault.
_Avoid_: Fact, note

**Person**:
A human contact.
_Avoid_: User, contact, member

**Location Link**:
A Link Kind that points at a geographic coordinate.
_Avoid_: Map link, place

**File Link**:
A Link Kind that points at a downloadable document or asset on the web.
_Avoid_: Attachment, download

**URL Link**:
A Link Kind for any other web page.
_Avoid_: Generic link, external link

**Plain Link**:
A link whose Link Kind is None, so it renders as an ordinary link rather than a pill.
_Avoid_: Fallback pill, unstyled link

**Enrichment**:
Optional extra detail, such as an avatar or a canonical name, that the host app adds to a Link Pill after it has already rendered. A pill is complete without it.
_Avoid_: Resolution, hydration, lookup

**Enricher**:
The host app's source of Enrichment for Mentions. The design system defines its shape but never supplies one.
_Avoid_: Resolver, provider, loader
