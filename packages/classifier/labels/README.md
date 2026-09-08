# Golden Labeling

Queues contain only `id` and `text`. Do not open the classification cache or
model scores while labelling.

Each label records expected product verdicts for:

- `aggressive_standard`
- `balanced_standard`
- `aggressive_nsfw`

Use `reasonCategory` to mark the human reason: `severe`, `harm`, `protected`,
`sentiment_middle_band`, `low_confidence`, or `visible`. Disagreements between
labelers are rubric findings until resolved.
