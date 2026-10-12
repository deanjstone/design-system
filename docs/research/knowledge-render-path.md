# How the knowledge app renders ingested content, and where Link Pills would hook in

Research for [design-system#87](https://github.com/deanjstone/design-system/issues/87) (map [#71](https://github.com/deanjstone/design-system/issues/71)).
Source: `deanjstone/myargus` `apps/knowledge` at `origin/main` `e2e01cf`. All paths below are relative to `apps/knowledge/`.

## Answer

The knowledge app has **no link rendering at all**. Every piece of ingested text is rendered as a React text node in a `<p>` (`whitespace-pre-wrap` for message bodies), with no markdown library, no HTML injection and no sanitiser. Neither existing Link Pill hook point exists here: there is no DOMPurify hook to attach the HTML-string shell to, and no markdown renderer to give `components.a` to the React shell. Adding pills would first require adding a markdown renderer. The React shell is the one that fits, because the app is React with no HTML-string path. Ingested content plausibly contains **URL** links, and some http(s) links ending in a file extension that `classify` would call **File**. It contains no `geo:` (Location) or `mention:` (Mention) links.

## 1. What is ingested and stored

Two ingest paths:

- **Chat export files** (`.md`, `.json`, `.zip`) dropped onto `IngestDropzone` (`src/components/IngestDropzone.tsx:70-72`, `:138`). A `.zip` must contain `conversations.json` (`:42-48`). Each file goes to `indexFile` (`src/ingest/indexer.ts:19`).
  - `detectFormat` recognises a Claude markdown transcript, a ChatGPT `mapping` JSON and a Claude export JSON (`src/ingest/parser.ts:13-24`).
  - The parsers reduce every conversation to `{ node: ChatNode, messages: Message[] }`. The `messages` are raw `{ role, content: string }` (`src/types/index.ts:67-75`):
    - Claude markdown: lines after `Human:` / `Assistant:` markers are kept verbatim, so they are still markdown (`parser.ts:26-62`).
    - ChatGPT: the string `parts` are joined (`parser.ts:95-98`).
    - Claude JSON: `chat_messages[].text` (`parser.ts:148-151`).
  - `summary` is the first assistant message, truncated to 500 chars (`parser.ts:58`, `:112`, `:154`).
- **memory-mcp memories**, pulled from Settings ("sync memories", `src/pages/SettingsView.tsx:132` → `src/lib/memory-sync.ts:9-20` → `fetchMemories`, `src/ingest/memory-source.ts:34-53`). Each memory becomes one node with `source: 'memory'`, `summary = content.slice(0, 500)` and a single assistant message holding `content` (`memory-source.ts:94-114`).

Storage (PGlite, `src/lib/db-schema.ts:4-22`):

- `chats` holds title, date, source, summary, tags, embedding and metadata.
- `chunks` holds the message **text**.
  - Chat chunks are produced by `chunkMessages`, which serialises messages as `"Human: …"` / `"Assistant: …"` joined by blank lines, at about 750 tokens each (`src/ingest/chunker.ts:14-17`, `:37`). They are stored at `indexer.ts:79-80`.
  - A memory is stored as one chunk of raw `content` with **no role prefix** (`src/ingest/memory-indexer.ts:40`).

The original message objects are not stored. Only the chunk text is.

## 2. How it is rendered

The only page that renders ingested body text is `ChatDetail` (`src/pages/ChatDetail.tsx`):

- It loads the chat and its chunks (`:41-45`), then reconstructs messages by splitting the chunk text on `\n\n(?=Human: |Assistant: )` (`parseChunkText`, `:12-23`, used at `:96`).
- Each message body is rendered as `<p className="… whitespace-pre-wrap">{msg.content}</p>` (`:151`). That is plain text: markdown syntax such as `[label](url)`, `**bold**` and code fences shows up literally, and URLs are not clickable.
- The summary is rendered as `<p …>{chat.summary}</p>` (`:114`). Title and tags are also plain text (`:112`, `:118-122`).

Elsewhere, `SearchView` shows a memory-mcp `snippet` as plain text (`src/pages/SearchView.tsx:183-184`).

Libraries: `package.json` has no markdown, HTML or sanitiser dependency (no `react-markdown`, `marked`, `remark` or `dompurify`). A grep of `src/` for `dangerouslySetInnerHTML`, `innerHTML`, `DOMPurify` and `markdown` finds nothing that renders content. The only `href` assignments are the OKF export download link (`src/lib/okf-export.ts:195`) and a sign-out redirect (`SettingsView.tsx:105`).

Side finding: memory nodes show **no body** in `ChatDetail`. Their chunk has no `Assistant: ` prefix (`memory-indexer.ts:40`), so `parseChunkText` returns `[]` and the page shows "No conversation content indexed." (`ChatDetail.tsx:155-156`). Only the 500-char summary appears.

## 3. Which shell and hook point fits

- **HTML-string shell plus DOMPurify `afterSanitizeAttributes`**: does not fit. The app never builds an HTML string and has no sanitiser.
- **React shell plus a markdown renderer's `components.a`**: this is the natural fit, but the hook point does not exist yet.
  - The work is to replace `ChatDetail.tsx:151` (and optionally `:114`) with a markdown renderer such as `react-markdown`, with `components.a` mapped to the Link Pill React shell.
  - That is a new dependency, and a behaviour change for every message body (markdown would start rendering).
  - The cheaper alternative is a linkify pass over plain text, but that would only ever produce URL or File kinds.
- The memory-body bug in the side finding above would need fixing first for memory content to render at all.

## 4. Would ingested content contain File, Location or Mention links?

- **URL**: yes. Claude and ChatGPT assistant replies routinely include markdown links and bare URLs. Of the memory files in `~/CONTEXT/02.MEMORY`, 102 contain at least one `](https://…)` link (local grep). memory-mcp `content` mirrors those files.
- **File**: occasionally. Under the decided rule (http(s) plus a file extension), GitHub blob links to `.md` files classify as File. The local memory corpus has at least 2 such links (for example `…/docs/decisions/adr-011-rolling-wave-backlog.md`). Chat replies sometimes link to PDFs and similar files. Whether `.md` blob links *should* count as File is a `classify` question, not a knowledge-app one.
- **Location (`geo:`) and Mention (`mention:`)**: no. No producer in either ingest path emits these schemes. The parsers keep text verbatim and add no links (`parser.ts`), and the local memory corpus has 0 files containing `geo:` or `mention:`. Exports from Claude and ChatGPT do not use these schemes [speculation: based on export shape, not an exhaustive scan of real exports].

## Implication for the map

If "in articles, only non-URL kinds become pills" carries over, the knowledge app would only ever pill File links, and only after a markdown renderer is introduced. That is low value for the cost. It is a candidate for "out of scope / later" unless knowledge rendering moves to markdown for its own reasons.
