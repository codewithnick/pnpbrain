/**
 * Shared skill definitions used by agent skill settings and backend validation.
 */
export const SKILL_NAMES = [
  'calculator',
  'datetime',
  'firecrawl',
  'lead_qualification',
  'meeting_scheduler',
  'support_escalation',
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];