# Surface types v1

A venue is not a problem. A venue is a set of surfaces, and every surface is one
of four types. Adding a venue should mean answering "which type is each of its
surfaces" and writing selectors — never writing a new suppression system.

All four types are the same mechanism with two things varied:

    suppress(unit) -> classify -> release(policy)

What differs is the **unit** being suppressed and the **trigger** that releases
it. Nothing else should differ, and a venue must never appear in suppression
logic.

## Type A — Item feed

Rows appear and persist. Order is stable, arrival is slow, latency is cheap.

- Unit: the row.
- Release: on that row's verdict.
- Failure direction: a row with no verdict stays hidden.

Surfaces: X own-post comments, YouTube comments, OnlyFans comments.

This is the behaviour already shipped, and it is the only type that needs no
further work.

## Type B — Stream

Continuous high-rate arrivals, order is meaningful, and the platform prunes old
rows to cap memory.

Per-row hide-and-reveal is wrong here for two reasons that only appear at speed:
a row revealed 400ms late pops in behind messages that arrived after it, so chat
visibly stutters; and a row can be pruned before its verdict lands, so it never
appears at all.

- Unit: the row, held in an ordered release buffer rather than in the DOM.
- Release: in arrival order, when the verdict lands or a short deadline expires.
- Failure direction: deadline expiry releases nothing — an unclassified row is
  dropped, not shown.

Surfaces: Twitch chat, YouTube live chat.

The buffer is what makes pruning safe: nothing is in the DOM until it has a
verdict, so there is no race between pruning and classification.

## Type C — Gated thread

A discrete open event loads a bounded set of messages. Because the open is
discrete, the whole view can be suppressed before it paints — which is the only
type where that is possible.

- Unit: the thread container.
- Release: after every loaded message has a verdict. All clean, reveal. Any
  fail, leave the thread and return to the list.
- Failure direction: the creator never enters a thread containing abuse.

Surfaces: X DMs, Instagram DMs, OnlyFans DMs, Fansly DMs.

The curtain must go up on route change, before messages paint. Suppressing after
render is the 200ms flash the plan forbids.

**Open problem, unsolved:** opening a thread to scan it marks it read on the
platform. That is an observable side effect and it tells an abuser their message
was read, which is the opposite of what this product is for. Worse, backing out
does not undo it. Any Type C implementation must establish whether the read
receipt fires on route change or on render, and whether the scan can happen
without it. If it cannot, that is a real cost of this design and Sam decides
whether to accept it.

## Type D — Summary list

Each row is a digest of content that is not otherwise on screen. The digest is
the leak: a conversation list delivers the worst line of every conversation at
once, on the page you cannot avoid.

- Unit: the whole row.
- Release: on the digest's verdict.
- Identity: the digest text hash or a platform id for the previewed message.
  Never the conversation id — the same conversation carries different text over
  time, so a conversation-keyed verdict goes stale and hides the wrong thing.
- Failure direction: hide the row.

Surfaces: the conversation list of every DM venue.

## What this buys

A new venue is a table, not a project:

| Venue | Type D | Type C | Type A | Type B |
|---|---|---|---|---|
| X | DM list | DM thread | own-post comments | — |
| YouTube | — | — | comments | live chat |
| Twitch | — | — | — | chat |
| Instagram | DM list | DM thread | — | — |
| OnlyFans | DM list | DM thread | post comments | — |
| Fansly | DM list | DM thread | — | — |

Six venues, four behaviours, zero venue-specific logic. A seventh venue costs
selectors and one row of that table.
