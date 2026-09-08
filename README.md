# Serenity

A Chrome extension that suppresses abusive and mentally exhausting inbound
messages for content creators, before the creator ever reads them.

The person this is for has already given up on their inbox, or is paying someone
to read it for them. Their alternative is nothing. That shapes every decision
here:

- **Recall over precision.** A missed abusive DM costs everything. A missed
  harmless one costs almost nothing.
- **No review queue, ever.** A folder of maybes is the same mental burden,
  restated. They will open it, and the product has failed.
- **The creator never sees the abuse, not even summarised.** No preview text, no
  "hidden: threat" badge, no hover-to-reveal. A count in the popup, and nothing
  else.

## How it works

A stylesheet injected at `document_start` hides message rows before they can
paint. A content script reads each row's text, the background worker classifies
it, and a clean verdict reveals the row. A row that is never judged stays
hidden, because that is the cheap error.

Classification is **descriptive, never permissive**. The model is asked "is this
sexual? is this hostile?" and never "should this be hidden" — asking a model to
moderate invites its own safety training to override the supplied taxonomy.
It returns a vector across sixteen axes, and a pure function in
`packages/core/src/ruleset.ts` turns that vector into a verdict.

That split is what makes `sexual_explicit + warm` hidden on YouTube and shown on
Fansly **from the same vector, with no second inference call** — and why changing
your aggression preset re-filters everything you have ever received instantly, at
zero token cost.

## Supported surfaces

X post comments · YouTube comments · YouTube live chat · Twitch chat ·
OnlyFans DMs, chat list and post comments

Each is selector data. Adding a venue should not require touching the content
script — if it does, the shape is wrong.

## Packages

| | |
|---|---|
| `core` | axes, ruleset, presets, service definitions |
| `classifier` | prompt, schema, corpus, golden set, spend ledger |
| `proxy` | `/classify`, global cache, quota, spend ceiling |
| `extension` | MV3 shell, content script, local cache, popup |

## Privacy

The global cache stores `sha256(normalise(text))` and a vector. **Message
plaintext is never written to the server** — a test walks every persisted
artifact and asserts the text is absent and only its hash is present.

Plaintext lives only in your own browser. Cross-user dedup still works, so
copypasta harassment and spam waves are classified once and served to everyone.

## Running it

```bash
yarn install
yarn typecheck && yarn test && yarn build
```

Tests never spend money and pass with no credentials. `packages/extension/build`
loads unpacked in Chrome.

See [CONTRIBUTING.md](CONTRIBUTING.md) — particularly if you are adding a venue
or changing the rubric, which is gated on a human-labelled golden set.

## Status

Working end to end and not yet released. No accounts, no billing, and no writes
to any platform: blocking, reporting and muting are deliberately out of scope,
which is what keeps this read-only.
