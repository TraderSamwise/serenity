# Golden Labeling

Queues contain only `id` and `text`. Do not open the classification cache or
model scores while labelling.

Labels should record only what a human can judge from text:

- whether the message is harmful to the recipient
- the primary taxonomy axis
- the human severity: `low`, `medium`, `high`, or `severe`
- any separate protective signal

Do not guess model scores or per-preset threshold outcomes while labelling.
Threshold placement is a separate calibration pass over text labels and cached
raw scores.

Verdicts are derived from labels at calibration time. `low` sits below the
aggressive threshold, `medium` sits between aggressive and balanced, `high` sits
above balanced, and `severe` is reserved for severe-axis behavior with a named
concrete act or direct severe harm.

Legacy v1 labels record expected product verdicts for `aggressive_standard`,
`balanced_standard`, and `aggressive_nsfw`. Their active `reasonCategory`
vocabulary is `severe`, `harm`, `protected`, or `visible`.
