# Interception v1 — implementation spec

Replaces DOM suppression. Messages are removed from network payloads before the
page's own code ever sees them, so nothing is rendered and then hidden.

## Decisions, and why

**Patch `fetch` and `XMLHttpRequest`, not `JSON.parse` or `Response.prototype.json`.**

uBlock Origin originally trapped `Response.prototype.json` in its `json-prune`
scriptlet and deliberately narrowed it to `JSON.parse` only, because trapping
`Response` was detectable and YouTube's adblock detection caught it. We take the
third option: wrap `fetch`/XHR itself and match on the request URL.

That is narrower than either. `JSON.parse` is called for everything a page
parses, so patching it puts our code in the hot path of the entire app for no
benefit — we only care about a handful of endpoints, and we need the URL anyway
to know which service a payload belongs to.

**Return a newly constructed `Response`, not a mutated one.** Building a fresh
`Response` from the filtered JSON means `.json()`, `.text()` and `.body` all see
filtered data. Patching `.json()` alone would miss any app that streams
`response.body`.

**Delete message objects. Never blank their text.** A blanked message still
occupies a bubble — the ad-blocker empty-placeholder problem — and it draws the
creator's eye to precisely the thing they must not think about. Deleted messages
leave nothing.

**Preserve everything else in the payload byte for byte.** Pagination cursors are
untouched; we remove array items, not cursors. If an unread or total count rides
in the same response, decrement it to match so app state stays consistent.

## Fail closed, always

This is the rule that matters most, and it is where we deliberately differ from
every ad blocker we read. They fail *open*: an unrecognised payload shape passes
through, because their cost of being wrong is an ad. Ours is abuse reaching a
creator.

So: if a request matches a configured message endpoint and we cannot do our job
for any reason, we **block the response** rather than pass it through.

Specifically, block on:
- The body does not parse as JSON.
- The configured message path is absent or is not an array.
- A message object has no id, or no text field.
- Classification does not resolve within the deadline.
- The bridge to the worker fails or the worker does not answer.

Blocking means the app sees a failed request. The creator sees the platform's own
error state: annoying, obvious, and reportable. That is the correct failure —
they know something is wrong instead of being silently served unfiltered abuse.

## The deadline

We hold the response while classifying, which no ad-block scriptlet does — their
decisions are microseconds from a static path match. Holding is legitimate: the
platform's own loading spinner covers the wait, so no placeholder of ours is
needed.

Cache hits resolve in single-digit milliseconds and dominate on repetitive
surfaces. Cold classification is a network round trip. Set the deadline from
measurement, not taste, and on expiry **block** — never release unclassified.

## Venue description

Selectors are replaced, not merely reduced. A venue becomes:

- a URL pattern deciding which service a page is
- one or more endpoint patterns carrying messages
- for each: the JSON path to the message array, and within a message, the path
  to its text and to its id

No container selectors, no row selectors, no text selectors, and no stableId
strategy — the payload carries its own ids, so `attribute`, `react-prop` and
`vue-prop` all die with the DOM path.

## Known limitations, to be recorded rather than solved now

- **A page can obtain an unpatched `fetch`** from a fresh iframe's
  `contentWindow`. This is a known adblock-evasion technique. No venue is doing
  it to us today because no venue knows we exist; if one starts, we will see it
  as messages arriving unfiltered.
- **`fetch.toString()` no longer reads as native code**, which is detectable.
  Preserve a native-looking `toString` on the wrapper.
- **WebSockets need their own wrapper.** Twitch chat is IRC over WebSocket and
  Instagram DMs use MQTT over WebSocket. Same MAIN-world script, different
  transport, and streaming frames need buffering rather than holding.
- **Server-rendered messages cannot be intercepted at all.** No venue we target
  does this — they are all SPAs — but a venue that did would need the DOM path
  we are deleting.

## Order of work

1. Service-worker check on OnlyFans. If its message traffic routes through its
   own service worker, `window.fetch` patching sees nothing and this plan does
   not apply there. This gates everything else.
2. fetch/XHR interception, OnlyFans only, proven on the chat list and one thread.
3. WebSocket interception, proven on Twitch chat.
4. Delete the DOM suppression path in one cutover.
