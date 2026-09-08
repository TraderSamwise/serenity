# Serenity — Plan v1

A Chrome extension that suppresses abusive and mentally exhausting inbound
messages for content creators, before the creator ever reads them.

## The bar

The user of this product has already given up on their inbox, or is paying an
agency to read it for them. Their alternative is *nothing*. So:

- **Recall over precision.** A missed abusive DM costs everything. A missed
  harmless DM costs almost nothing. Default aggression is high.
- **No review queue, ever.** A folder of maybes is the mental burden restated.
  The creator will open it, and the product has failed.
- **The creator never sees the abuse, not even summarised.** No preview text,
  no inline "hidden: threat" badge, no hover-to-reveal beside the message.
  Counts and search-on-demand only.

## Scope

**v1 ships**

- Read-only DOM suppression on supported inbound surfaces.
  - SFW: X DMs, comments on the creator's own X posts, YouTube comments,
    YouTube live chat, Instagram DMs, Twitch chat.
  - NSFW: OnlyFans DMs, Fansly DMs.
- Classification via a hosted proxy holding the API key.
- Three aggression presets plus per-site overrides.
- Hidden-count surfaced in the popup, nowhere else.

**v1 does not ship**

- Blocking, reporting, muting, or any write to any platform. Later, and
  default-off when it lands.
- Accounts, billing, credits. Anonymous install identity only (see
  [Identity](#identity-and-token-accounting)).
- Any storage of message plaintext on the server.

Deferring every write action is what keeps v1 small: no session handling, no
platform automation, no ToS exposure, no per-platform action code. Today every
surface is DOM hiding only. Future auto moderation, ban, block, and platform
hide actions sit behind a separate default-off capability layer.

## Architecture

```
content script  ──extract──▶  background worker  ──batch──▶  proxy  ──▶  OpenAI
      ▲                              │                         │
      └────── hide/show ─────────────┘                    global cache
                                 local cache              (hash → vector)
                              (IndexedDB, per-profile)
```

- **Content script** per platform: MutationObserver over the message/comment
  list, extracts `{stableId, text}`, applies `display:none` on verdict. Hides
  optimistically until classified, so nothing flashes into view.
- **Background worker**: batches, dedupes, owns the local cache, applies the
  ruleset. The ruleset runs *client-side* — the server never knows a user's
  settings.
- **Proxy**: key custody, global cache, quota, hard spend ceiling.

## Classification schema

Axes are **descriptive, never permissive**. No axis answers "should this be
hidden" — that is the ruleset's job. This is what makes one classification valid
for every user on every site, and therefore globally cacheable.

Harm axes: `insult`, `threat`, `coercion`, `identity_attack`,
`appearance_attack`, `sexual_explicit`, `sexual_degrading`, `sexual_violent`,
`self_harm_directed`, `parasocial_intensity`, `spam_scam`.

Protective axes (costly to hide, not costly to read): `business_inquiry`,
`transactional`, `legal_notice`, `self_harm_disclosure`, `minor_indicators`.

Plus `sentiment` (-1..1), `targeted` (0..1), `confidence` (0..1).

Written in `packages/core/src/axes.ts`. The schema is versioned; a bump means
re-classifying the cache, which is the expensive migration — so the schema is
deliberately broader than v1 needs.

### Why the model is never asked to moderate

Asking "does this violate the rules" invites the model's own safety training to
override the supplied taxonomy — Anthropic documents exactly this for adult
platforms, and OpenAI's models moralise similarly. Asking "is this sexual? is
this hostile?" does not. Description is stable; permission is a per-site ruleset
in JS. `sexual_explicit + warm` is hidden on YouTube and shown on Fansly from
the *same vector*, with no second inference call.

### Tiering

| Tier | Cost | Role |
|---|---|---|
| 0. Local heuristics | free | Slur/regex list. Catches the floor instantly, offline. |
| 1. OpenAI moderation endpoint | free | `omni-moderation-latest`. Catches the obvious. |
| 2. Cheap structured model | paid | Fills the full axis vector. |

Tier 1 may only *short-circuit to hidden* when the message would also be hidden
at the most permissive preset. Otherwise it escalates to tier 2. Without this
rule, loosening the slider later cannot un-hide anything, and the "policy change
costs zero tokens" property breaks.

## Ruleset and presets

Pure function, `evaluate(classification, ruleset) → verdict`, in
`packages/core/src/ruleset.ts`. Evaluation order:

1. **Severe axes first** — `threat`, `coercion`, `sexual_violent`,
   `self_harm_directed`. Nothing masks these; a claimed brand deal does not buy
   a death threat a pass.
2. **Protective override** — a business/legal/transactional signal keeps the
   message visible.
3. Remaining harm axes against per-preset thresholds, skipping the site's
   `ignore` list.
4. Sentiment floor only with corroboration: hide only when sentiment is at or
   below the preset floor and at least one non-ignored harm axis is at or above
   its own threshold multiplied by the preset's corroboration ratio. Tone alone
   was hiding substantive criticism, so sentiment now needs a harm signal.
5. Low confidence → the preset decides (aggressive presets hide).

Presets: `nuclear`, `aggressive` (default), `balanced`, `off`. Site profiles
differ only by `ignore` — the NSFW profile ignores `sexual_explicit` and keeps
every other axis live.

Because policy is a pure function over stored vectors, changing a preset
re-filters the entire history instantly at zero token cost. That is also the
demo.

## Privacy model

The global cache is keyed on `sha256(normalise(text))` and stores **only the
hash and the vector**. Message plaintext is never written to the server.

- Cross-user dedup still works: copypasta harassment and spam waves are
  classified once and served to everyone.
- Plaintext lives only in the user's own browser, in their own local cache.
- Trade-off: a schema bump cannot re-classify from the server cache, because
  the text is gone. Accepted. The eval corpus is curated separately.

## Running on your own OpenAI account without getting banned

The use case is sanctioned — classifying inbound abuse is what the moderation
endpoint exists for, and OpenAI enforcement targets *generation* and developers
facilitating end-user misuse. Neither describes this. But the hygiene below
turns "probably fine" into "on the record and blast-radius contained".

**1. `safety_identifier` on every single request.** This is the specific
mechanism OpenAI documents for this problem: with a stable per-end-user
identifier, *"access may be temporarily revoked for the specific affected user
rather than the entire organization"*. Send `sha256(installId)` — never
anything identifying. Skipping this is what converts one abusive end user into
an org-wide suspension. Everything else here is secondary to it.

**2. Dedicated Project inside your existing org,** with its own API key and its
own spend limit set below the org limit. Two ceilings, independently enforced,
and usage for this product is separable from your other work.

Note a Project is a *budgeting* boundary, not an enforcement one — a policy
action still lands on the org. A genuinely separate organisation is not
self-serve (OpenAI requires a request and steers you to Projects), so treat it
as a conversation to have once there are real users, not a prerequisite.

**3. Classification-only call shape.** Structured output against a JSON schema,
low `max_output_tokens`, no free-form prose. The model never writes *about* the
abuse, it emits a vector. Nothing in the response can itself be a violation.

**4. Let the free tier carry the volume.** The moderation endpoint is free,
purpose-built, and the traffic shape OpenAI expects from a T&S product.

**5. Fixture-first development.** Classify a corpus once, cache to disk, commit
the cache, then iterate against it offline. Almost all dev — DOM work, UI,
thresholds, presets — needs zero live calls. This is simultaneously the biggest
ban-risk reduction and the biggest dev cost saving.

**6. Never develop against real user DMs.** Synthetic examples plus public
labelled datasets (Jigsaw toxic comments and similar) for the corpus.

**7. Declare the use case** to OpenAI support before going past hobby volume.
Normal for a T&S product, and it converts a surprise warning into a known
account.

## Identity and token accounting

No accounts on day 1, and none needed.

- On first run the extension generates `crypto.randomUUID()` into
  `chrome.storage.local`. The proxy issues a signed token bound to it.
- That install ID is **both** the quota key and (hashed) the
  `safety_identifier`. One identity, two jobs.
- **IP is a secondary signal only** — used to spot "300 fresh installs from one
  address in an hour", never as the primary key. CGNAT and VPNs make it wrong
  in both directions.
- **It is trivially resettable.** Clearing storage or reinstalling mints a new
  ID. Accepted: the global hard ceiling is the real backstop, and the person
  motivated to farm free classification of their own DMs is not the threat.
- Add friction only if abuse actually appears. Not day 1.

**Forward-compatible with accounts.** Usage is already keyed to a stable
identity, so signing up later just *claims* one or more install IDs and carries
their history and credits forward. Free-credit balances, then paid tokens or
subscription, drop in on top without re-architecting anything.

## Cost

Measured fixture run, 2026-09-08, in the dedicated OpenAI `serenity` project:
408 requests, 816,264 tokens, $0.05 billed by the OpenAI dashboard.

- **~$0.22 per 1,000 messages** classified at tier 2.
- A creator receiving 5,000 messages/month ≈ **$1.10/month**, before tier 0/1
  deflection and before global cache hits.

Cheap enough that day-1 free credits cost nothing meaningful, and cheap enough
that the hard global ceiling is a guard against runaway bugs rather than a
guard against users.

Controls: project-level spend cap, org-level spend cap, per-install soft quota,
and a kill switch in the proxy that degrades to tiers 0–1 (free, still useful)
instead of erroring.

## Eval

The golden set is the real asset — a few hundred human-labelled messages
spanning the axis space, deliberately overweighted on the hard quadrants:
explicit + warm, explicit + hostile, business inquiry + rude, criticism that is
harsh but legitimate.

It pays for model selection, prompt regressions, threshold tuning, and the one
open question: **does model discomfort leak sideways into `sentiment` on
explicit input?** Measure the *variance* of sentiment within `sexual_explicit`
high vs low — a shifted mean is correctable by calibration, a compressed spread
is not, and only the second forces sentiment onto a separate call.

Measured on the 2026-09-08 fixture cache with `gpt-5-mini-2025-08-07`:
`sexual_explicit >= 0.5` had n=33, sentiment mean 0.127, variance 0.721;
`sexual_explicit < 0.5` had n=191, sentiment mean -0.254, variance 0.354.
The explicit set has wider spread, not compressed spread, so sentiment does not
need its own call.

Store raw scores, never post-threshold decisions, so calibration can be applied
at read time and revised retroactively without re-classifying anything.

Pin exact dated model snapshots. No `-latest` aliases anywhere: a silent
provider roll invalidates calibration and nothing tells you.

## Build order

1. `packages/core` — axes, ruleset, presets, tests. No network. **Started.**
2. Fixture corpus + the classifier prompt, run once, cached to disk.
3. Proxy: single `/classify` endpoint, hash cache, install-ID tokens, spend cap.
4. Extension shell: MV3 manifest, background worker, local cache, popup.
5. X end-to-end, then YouTube, Instagram, Twitch, Fansly, OnlyFans — selectors
   only.
6. Golden set + calibration check.
