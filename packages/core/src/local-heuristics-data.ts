import type { ScoredAxis } from './axes'

// Tier 0 is a tiny English obvious-floor net, not a comprehensive abuse list.
// Keep this conservative; broad pattern sets belong in the classifier rubric.
export const LOCAL_HEURISTIC_RULES = [
  {
    axis: 'self_harm_directed',
    pattern: String.raw`\b(kys|kill yourself)\b`,
  },
  {
    axis: 'threat',
    pattern: String.raw`\bi\s+will\s+(kill|hurt|find)\s+you\b`,
  },
  {
    axis: 'spam_scam',
    pattern: String.raw`\b(seed phrase|wallet recovery|crypto doubling|airdrop claim)\b`,
  },
  {
    axis: 'identity_attack',
    pattern: String.raw`\bgo back to your country\b`,
  },
] as const satisfies readonly LocalHeuristicRule[]

export interface LocalHeuristicRule {
  axis: ScoredAxis
  pattern: string
}
