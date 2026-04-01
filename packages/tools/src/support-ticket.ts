/**
 * Support ticket escalation tool.
 * Lets the agent raise a support ticket through the host application's integration handler.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export interface CreateSupportTicketPayload {
  reason: string;
  customerMessage: string;
  customerEmail?: string;
  customerName?: string;
}

export interface SupportTicketToolResult {
  status: 'created' | 'failed';
  provider: string;
  externalTicketId?: string;
  externalTicketUrl?: string;
  message: string;
}

export interface SupportTicketToolOptions {
  createTicket: (payload: CreateSupportTicketPayload) => Promise<SupportTicketToolResult>;
}

export function createSupportTicketTool(options: SupportTicketToolOptions) {
  return new DynamicStructuredTool({
    name: 'raise_support_ticket',
    description:
      'Creates a support escalation ticket for a human team when the agent cannot fully resolve the request.',
    schema: z.object({
      reason: z.string().min(1).max(200).describe('Concise reason for escalation.'),
      customerMessage: z
        .string()
        .min(1)
        .max(4000)
        .describe('The customer issue summary and what they need help with.'),
      customerEmail: z.string().email().optional().describe('Customer email address if known.'),
      customerName: z.string().min(1).max(120).optional().describe('Customer full name if known.'),
    }),
    func: async (payload: CreateSupportTicketPayload) => {
      const result = await options.createTicket(payload);
      if (result.status === 'created') {
        return [
          'Support escalation submitted successfully.',
          `Provider: ${result.provider}`,
          result.externalTicketId ? `Ticket ID: ${result.externalTicketId}` : null,
          result.externalTicketUrl ? `Ticket URL: ${result.externalTicketUrl}` : null,
        ]
          .filter((line): line is string => !!line)
          .join('\n');
      }

      return `Support escalation failed: ${result.message}`;
    },
  });
}
