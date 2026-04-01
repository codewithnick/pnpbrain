/**
 * Lead handoff tool.
 * Lets the agent route a qualified lead to the host application's CRM or automation layer.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export interface CreateLeadHandoffPayload {
  reason: string;
  qualificationScore?: number;
  qualificationStage?: 'nurture' | 'mql' | 'sql';
  customerMessage: string;
  summary: string;
  customerEmail?: string;
  customerName?: string;
  companyName?: string;
}

export interface LeadHandoffToolResult {
  status: 'created' | 'failed';
  provider: string;
  externalRecordId?: string;
  externalRecordUrl?: string;
  message: string;
}

export interface LeadHandoffToolOptions {
  createLeadHandoff: (payload: CreateLeadHandoffPayload) => Promise<LeadHandoffToolResult>;
}

export function createLeadHandoffTool(options: LeadHandoffToolOptions) {
  return new DynamicStructuredTool({
    name: 'route_qualified_lead',
    description:
      'Routes a qualified lead to the connected CRM or automation workflow after the agent confirms sales readiness.',
    schema: z.object({
      reason: z.string().min(1).max(200).describe('Concise reason for routing the lead.'),
      qualificationScore: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe('Lead qualification score from the qualification step.'),
      qualificationStage: z
        .enum(['nurture', 'mql', 'sql'])
        .optional()
        .describe('Lead readiness stage from qualification.'),
      customerMessage: z
        .string()
        .min(1)
        .max(4000)
        .describe('Customer request or discovery summary that triggered the handoff.'),
      summary: z
        .string()
        .min(1)
        .max(4000)
        .describe('Short summary of the lead and why it should be routed.'),
      customerEmail: z.string().email().optional().describe('Customer email address if known.'),
      customerName: z.string().min(1).max(120).optional().describe('Customer full name if known.'),
      companyName: z.string().min(1).max(160).optional().describe('Customer company name if known.'),
    }),
    func: async (payload: CreateLeadHandoffPayload) => {
      const result = await options.createLeadHandoff(payload);
      if (result.status === 'created') {
        return [
          'Lead handoff submitted successfully.',
          `Provider: ${result.provider}`,
          result.externalRecordId ? `Record ID: ${result.externalRecordId}` : null,
          result.externalRecordUrl ? `Record URL: ${result.externalRecordUrl}` : null,
        ]
          .filter((line): line is string => !!line)
          .join('\n');
      }

      return `Lead handoff failed: ${result.message}`;
    },
  });
}