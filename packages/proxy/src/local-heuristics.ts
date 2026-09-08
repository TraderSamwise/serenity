import type { Classification } from '@serenity/core'
import { classificationWithScores, LOCAL_HEURISTICS_MODEL } from './vector'

const LOCAL_RULES: Array<{ pattern: RegExp; classification: Classification }> = [
  {
    pattern: /\b(kys|kill yourself)\b/i,
    classification: classificationWithScores(
      { self_harm_directed: 1 },
      LOCAL_HEURISTICS_MODEL,
    ),
  },
  {
    pattern: /\bi will (kill|hurt|find) you\b/i,
    classification: classificationWithScores({ threat: 1 }, LOCAL_HEURISTICS_MODEL),
  },
  {
    pattern: /\b(seed phrase|wallet recovery|crypto doubling|airdrop claim)\b/i,
    classification: classificationWithScores({ spam_scam: 1 }, LOCAL_HEURISTICS_MODEL),
  },
]

export function classifyWithLocalHeuristics(text: string): Classification | null {
  return LOCAL_RULES.find((rule) => rule.pattern.test(text))?.classification ?? null
}
