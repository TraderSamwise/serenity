import type { CostEstimate } from './pricing'

export const PAID_RUN_OPT_IN = 'SERENITY_ALLOW_PAID_RUN'

export function shouldRefusePaidRun(
  projectedClassifications: number,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return projectedClassifications > 0 && env[PAID_RUN_OPT_IN] !== '1'
}

export function paidRunRefusalMessage(
  projectedClassifications: number,
  estimate: CostEstimate,
): string {
  return [
    'Refusing paid classifier run.',
    `Set ${PAID_RUN_OPT_IN}=1 to classify`,
    `${projectedClassifications} message(s) for estimated_cost_usd=${estimate.estimatedCostUsd.toFixed(4)}.`,
  ].join(' ')
}
