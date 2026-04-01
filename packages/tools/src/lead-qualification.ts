/**
 * Lead qualification tool — scores deal-readiness based on discovery inputs.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const urgencyScore: Record<'low' | 'medium' | 'high', number> = {
  low: 6,
  medium: 13,
  high: 20,
};

const authorityScore: Record<'unknown' | 'influencer' | 'decision_maker', number> = {
  unknown: 5,
  influencer: 13,
  decision_maker: 20,
};

const timelineScore: Record<'immediate_30d' | 'quarter_6m' | 'later', number> = {
  immediate_30d: 15,
  quarter_6m: 10,
  later: 4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getBudgetScore(budgetUsd?: number): number {
  if (!budgetUsd || budgetUsd <= 0) return 6;
  if (budgetUsd >= 10000) return 25;
  if (budgetUsd >= 5000) return 20;
  if (budgetUsd >= 1500) return 14;
  return 9;
}

function getNeedScore(needRating?: number, painPoints?: string[]): number {
  if (typeof needRating === 'number') {
    return clamp(Math.round((needRating / 10) * 20), 1, 20);
  }
  const inferred = (painPoints?.filter((item) => item.trim().length > 0).length ?? 0) * 5;
  return clamp(inferred, 4, 20);
}

function inferStage(score: number): 'nurture' | 'mql' | 'sql' {
  if (score >= 75) return 'sql';
  if (score >= 50) return 'mql';
  return 'nurture';
}

export const leadQualificationTool = new DynamicStructuredTool({
  name: 'qualify_lead',
  description:
    'Evaluates lead quality and deal readiness using sales discovery inputs like budget, authority, urgency, need, and timeline.',
  schema: z.object({
    customerName: z.string().optional().describe('Lead contact name.'),
    companyName: z.string().optional().describe('Company or account name.'),
    budgetUsd: z.number().positive().optional().describe('Estimated budget in USD.'),
    urgency: z
      .enum(['low', 'medium', 'high'])
      .default('medium')
      .describe('How urgent the lead need is.'),
    authority: z
      .enum(['unknown', 'influencer', 'decision_maker'])
      .default('unknown')
      .describe('Lead influence on the purchase decision.'),
    timeline: z
      .enum(['immediate_30d', 'quarter_6m', 'later'])
      .default('quarter_6m')
      .describe('Expected purchase timeline.'),
    needRating: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .describe('How strongly the lead needs the solution on a 1-10 scale.'),
    painPoints: z
      .array(z.string())
      .max(10)
      .optional()
      .describe('List of business pain points mentioned by the lead.'),
  }),
  func: async ({
    customerName,
    companyName,
    budgetUsd,
    urgency,
    authority,
    timeline,
    needRating,
    painPoints,
  }: {
    customerName?: string;
    companyName?: string;
    budgetUsd?: number;
    urgency: 'low' | 'medium' | 'high';
    authority: 'unknown' | 'influencer' | 'decision_maker';
    timeline: 'immediate_30d' | 'quarter_6m' | 'later';
    needRating?: number;
    painPoints?: string[];
  }) => {
    const budget = getBudgetScore(budgetUsd);
    const urgencyPart = urgencyScore[urgency];
    const authorityPart = authorityScore[authority];
    const need = getNeedScore(needRating, painPoints);
    const timelinePart = timelineScore[timeline];

    const total = budget + urgencyPart + authorityPart + need + timelinePart;
    const stage = inferStage(total);

    const nextAction =
      stage === 'sql'
        ? 'Book a discovery/demo meeting and prepare a tailored proposal.'
        : stage === 'mql'
          ? 'Run qualification follow-up: confirm decision process, budget range, and timeline.'
          : 'Keep in nurture sequence with educational content and light check-ins.';

    const missingSignals: string[] = [];
    if (!budgetUsd) missingSignals.push('budget');
    if (authority === 'unknown') missingSignals.push('decision authority');
    if (!needRating && (!painPoints || painPoints.length === 0)) missingSignals.push('clear pain points');

    const leadLabel = [customerName, companyName].filter(Boolean).join(' @ ');

    return [
      `Lead qualification summary${leadLabel ? ` for ${leadLabel}` : ''}:`,
      `Deal readiness score: ${total}/100`,
      `Stage: ${stage.toUpperCase()}`,
      `Breakdown: budget ${budget}/25, urgency ${urgencyPart}/20, authority ${authorityPart}/20, need ${need}/20, timeline ${timelinePart}/15`,
      `Recommended next action: ${nextAction}`,
      missingSignals.length > 0
        ? `Missing discovery signals: ${missingSignals.join(', ')}`
        : 'Missing discovery signals: none',
    ].join('\n');
  },
});