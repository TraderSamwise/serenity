# Contributing

Two kinds of contribution matter most, and they have different bars.

## Adding a venue

A venue is selector data. If adding one requires changing the content script,
the shape is wrong — say so in the issue rather than working around it.

You need: a URL pattern deciding which service a page is, a container and row
selector, a text selector if the row's own `textContent` drags in too much
interface, and a service-to-profile mapping (`standard`, or `nsfw` where sexual
content is expected and every other axis still applies).

Two rules that are not style preferences:

- **Never guess a selector.** Inspect the live DOM. A guessed selector passes
  tests and hides the wrong message in someone's inbox.
- **Measure your text extraction.** Row text feeds the cache key, so noise —
  timestamps, display names, like counts — means identical messages hash
  differently and cross-user dedup stops working. Report the ratio of row text
  length to message text length; near 1 is right.

## Changing the rubric

The rubric is the axis definitions in `packages/core/src/axes.ts`. It is a
prompt, so changing it changes how every message everywhere is scored.

**A rubric change must not regress the golden set.** CI scores the model against
`packages/classifier/labels/` and fails if agreement drops. That gate exists
because a rubric regression is invisible — unlike a broken selector, nothing
looks wrong, the model just quietly scores differently and a creator sees
something they should not have.

Bump `CLASSIFIER_RUBRIC_VERSION` with any change. The cache key is scoped by
rubric version and axis, so a bump re-requests only the axes whose wording
changed rather than the whole corpus.

What works, learned the hard way: **define an axis by what a message does to the
recipient, not by its surface form,** and pair contrastive high and low examples.
`insult` scored sarcasm and backhanded praise near zero until it was rewritten
that way. The same fix then worked for `coercion` and `threat`, which had the
identical blind spot.

## The golden set

`labels/` holds human labels written from message text alone, with model scores
hidden. That is not ceremony: a golden set whose author could see the classifier
output measures agreement with itself.

If you add labels, label from the text. Say what is harmful, which axis is
primary, how severe on the coarse scale, and whether a protective signal is
present. Do not write per-preset verdicts — those are derived from the label and
the thresholds, and asking a human for one forces them to guess a model score.

Non-English coverage is the largest gap. The corpus and the tier-0 list are
English-only today.

## Running it

```
yarn install
yarn typecheck && yarn test && yarn build
```

Tests never spend money and pass with no credentials present. Paid tests are
grouped behind their own switch, and the classifier runner refuses to run
without an explicit opt-in and prints a cost projection first. Every paid run
appends to `packages/classifier/spend-ledger.v1.jsonl`.

## What will be turned down

- Anything that shows the creator what was hidden — preview text, a reason
  badge, a hover-to-reveal, a review queue. The product bar is that they never
  see the abuse, not even summarised. A folder of maybes is the burden restated.
- Any write to any platform: blocking, reporting, muting, replying. v1 is
  read-only DOM suppression, and that is also what keeps it defensible.
- Message plaintext reaching the server. The global cache stores a hash and a
  vector, and that is the privacy claim the product rests on.
