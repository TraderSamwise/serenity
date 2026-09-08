# Golden Labeling

Queues contain only `id` and `text`. Do not open the classification cache or
model scores while labelling.

Labels should record only what a human can judge from text:

- whether the message is harmful to the recipient
- the primary taxonomy axis
- the human severity

Do not guess model scores or per-preset threshold outcomes while labelling.
Threshold placement is a separate calibration pass over text labels and cached
raw scores.

Legacy v1 labels record expected product verdicts for `aggressive_standard`,
`balanced_standard`, and `aggressive_nsfw`. Their active `reasonCategory`
vocabulary is `severe`, `harm`, `protected`, or `visible`.
