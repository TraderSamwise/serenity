import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  PRESETS,
  SITE_PROFILES,
  evaluate,
  rulesetFor,
} from '@serenity/core'
import type { Classification } from '@serenity/core'
import {
  CLASSIFIER_RUBRIC_VERSION,
  RUBRIC_FIELD_VERSIONS,
} from './prompt'
import { CLASSIFIER_MODEL } from './schema'
import { cacheKeyForText } from './hash'
import { loadClassificationCache, readCorpusJsonl } from './cache'
import {
  LABEL_CONTEXTS,
  assertTextOnlyGoldenLabels,
  expectedVerdictsFromTextLabel,
  readJsonl,
} from './labeling'
import type { LabelContext, LabelVerdict, TextOnlyGoldenLabel } from './labeling'

const CORPUS_PATH = resolve(process.env.SERENITY_GOLDEN_CORPUS_PATH ?? 'fixtures/corpus.jsonl')
const CACHE_PATH = resolve(
  process.env.SERENITY_GOLDEN_CACHE_PATH ?? 'fixtures/classification-cache.v1.json',
)
const LABELS_DIR = resolve(process.env.SERENITY_GOLDEN_LABELS_DIR ?? 'labels')
const BASELINE_PATH = resolve(process.env.SERENITY_GOLDEN_BASELINE_PATH ?? 'golden-baseline.v1.json')
const LABEL_FILE_SUFFIX = '.labels.v2.jsonl'

interface GoldenGateBaseline {
  labelVersion: number
  model: string
  rubricVersion: number
  contexts: Record<LabelContext, GoldenGateContextBaseline>
}

interface GoldenGateContextBaseline {
  agreementFloor: number
  maxRecallMisses: number
  maxFalsePositives: number
}

interface GoldenGateContextReport {
  labels: number
  matches: number
  agreement: number
  recallMisses: GoldenGateMismatch[]
  falsePositives: GoldenGateMismatch[]
}

interface GoldenGateMismatch {
  id: string
  expected: LabelVerdict
  actual: LabelVerdict
  primaryAxis: string
  severity: string
}

async function main(): Promise<void> {
  assertCacheFresh(await readRawCache(CACHE_PATH))

  const corpus = await readCorpusJsonl(CORPUS_PATH)
  const cache = await loadClassificationCache(CACHE_PATH)
  const labels = await readCurrentLabels(LABELS_DIR)
  const baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8')) as GoldenGateBaseline

  assertBaselineMatchesCurrent(baseline)
  assertTextOnlyGoldenLabels(labels)

  const report = scoreGoldenSet(corpus, cache.entries, labels)
  printReport(report)
  assertMeetsBaseline(report, baseline)
}

await main()

async function readCurrentLabels(labelsDir: string): Promise<TextOnlyGoldenLabel[]> {
  const files = (await readdir(labelsDir))
    .filter((file) => file.endsWith(LABEL_FILE_SUFFIX))
    .sort()
  const labels = await Promise.all(
    files.map((file) => readJsonl<TextOnlyGoldenLabel>(join(labelsDir, file))),
  )
  return labels.flat()
}

async function readRawCache(path: string): Promise<{
  rubricVersion?: number
  model?: string
  fieldRubricVersions?: Record<string, number>
}> {
  return JSON.parse(await readFile(path, 'utf8')) as {
    rubricVersion?: number
    model?: string
    fieldRubricVersions?: Record<string, number>
  }
}

function assertCacheFresh(cache: {
  rubricVersion?: number
  model?: string
  fieldRubricVersions?: Record<string, number>
}): void {
  if (cache.model !== CLASSIFIER_MODEL) {
    throw new Error(
      `Golden gate cache model mismatch: expected ${CLASSIFIER_MODEL}, found ${cache.model ?? 'missing'}. A maintainer must re-run the corpus.`,
    )
  }
  if (cache.rubricVersion !== CLASSIFIER_RUBRIC_VERSION) {
    throw new Error(
      `Golden gate cache rubric mismatch: expected v${CLASSIFIER_RUBRIC_VERSION}, found v${cache.rubricVersion ?? 'missing'}. The corpus needs re-running by a maintainer; CI will not spend money.`,
    )
  }
  for (const [field, version] of Object.entries(RUBRIC_FIELD_VERSIONS)) {
    if (cache.fieldRubricVersions?.[field] !== version) {
      throw new Error(
        `Golden gate cache field ${field} is stale: expected rubric v${version}, found v${cache.fieldRubricVersions?.[field] ?? 'missing'}. The corpus needs re-running by a maintainer; CI will not spend money.`,
      )
    }
  }
}

function assertBaselineMatchesCurrent(baseline: GoldenGateBaseline): void {
  if (baseline.model !== CLASSIFIER_MODEL || baseline.rubricVersion !== CLASSIFIER_RUBRIC_VERSION) {
    throw new Error('Golden gate baseline does not match the current model/rubric version.')
  }
  for (const context of LABEL_CONTEXTS) {
    if (baseline.contexts[context] === undefined) {
      throw new Error(`Golden gate baseline is missing ${context}.`)
    }
  }
}

function scoreGoldenSet(
  corpus: Awaited<ReturnType<typeof readCorpusJsonl>>,
  entries: Record<string, Classification>,
  labels: readonly TextOnlyGoldenLabel[],
): Record<LabelContext, GoldenGateContextReport> {
  const textById = new Map(corpus.map((message) => [message.id, message.text]))
  const reports: Record<LabelContext, GoldenGateContextReport> = {
    aggressive_standard: emptyContextReport(),
    balanced_standard: emptyContextReport(),
    aggressive_nsfw: emptyContextReport(),
  }

  for (const label of labels) {
    const text = textById.get(label.id)
    if (text === undefined) throw new Error(`Label ${label.id} is not in the corpus.`)
    const classification = entries[cacheKeyForText(text)]
    if (classification === undefined) {
      throw new Error(`Missing cached vector for labelled message ${label.id}.`)
    }

    const expected = expectedVerdictsFromTextLabel(label)
    const actual = actualVerdicts(classification)
    for (const context of LABEL_CONTEXTS) {
      const contextReport = reports[context]
      contextReport.labels += 1
      if (actual[context] === expected[context]) {
        contextReport.matches += 1
        continue
      }
      const mismatch = {
        id: label.id,
        expected: expected[context],
        actual: actual[context],
        primaryAxis: label.primaryAxis,
        severity: label.severity,
      }
      if (expected[context] === 'hide') {
        contextReport.recallMisses.push(mismatch)
      } else {
        contextReport.falsePositives.push(mismatch)
      }
    }
  }

  for (const report of Object.values(reports)) {
    report.agreement = report.labels === 0 ? 0 : report.matches / report.labels
  }
  return reports
}

function emptyContextReport(): GoldenGateContextReport {
  return {
    labels: 0,
    matches: 0,
    agreement: 0,
    recallMisses: [],
    falsePositives: [],
  }
}

function actualVerdicts(classification: Classification): Record<LabelContext, LabelVerdict> {
  return {
    aggressive_standard: evaluate(classification, PRESETS.aggressive).hide ? 'hide' : 'show',
    balanced_standard: evaluate(classification, PRESETS.balanced).hide ? 'hide' : 'show',
    aggressive_nsfw: evaluate(
      classification,
      rulesetFor(PRESETS.aggressive, SITE_PROFILES.nsfw),
    ).hide
      ? 'hide'
      : 'show',
  }
}

function printReport(report: Record<LabelContext, GoldenGateContextReport>): void {
  for (const context of LABEL_CONTEXTS) {
    const item = report[context]
    console.log(
      [
        `context=${context}`,
        `labels=${item.labels}`,
        `agreement=${formatPercent(item.agreement)}`,
        `recall_misses=${item.recallMisses.length}`,
        `false_positives=${item.falsePositives.length}`,
        `recall_miss_ids=${formatIds(item.recallMisses)}`,
        `false_positive_ids=${formatIds(item.falsePositives)}`,
      ].join(' '),
    )
  }
}

function assertMeetsBaseline(
  report: Record<LabelContext, GoldenGateContextReport>,
  baseline: GoldenGateBaseline,
): void {
  const failures: string[] = []
  for (const context of LABEL_CONTEXTS) {
    const actual = report[context]
    const expected = baseline.contexts[context]
    if (actual.agreement < expected.agreementFloor) {
      failures.push(`${context} agreement ${formatPercent(actual.agreement)} below floor ${formatPercent(expected.agreementFloor)}`)
    }
    if (actual.recallMisses.length > expected.maxRecallMisses) {
      failures.push(`${context} recall misses ${actual.recallMisses.length} above max ${expected.maxRecallMisses}`)
    }
    if (actual.falsePositives.length > expected.maxFalsePositives) {
      failures.push(`${context} false positives ${actual.falsePositives.length} above max ${expected.maxFalsePositives}`)
    }
  }
  if (failures.length > 0) throw new Error(`Golden gate regression:\n${failures.join('\n')}`)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function formatIds(mismatches: readonly GoldenGateMismatch[]): string {
  return mismatches.length === 0 ? 'none' : mismatches.map((mismatch) => mismatch.id).join(',')
}
