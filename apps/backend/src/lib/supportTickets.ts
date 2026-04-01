import { getDb } from '@gcfis/db/client';
import { supportTickets } from '@gcfis/db/schema';
import { getSupportIntegrationForBusiness } from './businessSkills';

export interface CreateSupportTicketInput {
  businessId: string;
  conversationId: string;
  reason: string;
  customerMessage: string;
  customerEmail?: string;
  customerName?: string;
  assistantMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSupportTicketResult {
  status: 'created' | 'failed';
  provider: string;
  externalTicketId?: string;
  externalTicketUrl?: string;
  message: string;
}

interface ZendeskTicketResponse {
  ticket?: {
    id?: number;
    url?: string;
  };
}

async function createZendeskTicket(args: {
  subdomain: string;
  supportEmail: string;
  apiToken: string;
  subject: string;
  body: string;
  customerEmail?: string;
  customerName?: string;
}): Promise<{ ticketId?: string; ticketUrl?: string }> {
  const endpoint = `https://${args.subdomain}.zendesk.com/api/v2/tickets.json`;
  const auth = Buffer.from(`${args.supportEmail}/token:${args.apiToken}`).toString('base64');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      ticket: {
        subject: args.subject,
        comment: {
          body: args.body,
        },
        requester:
          args.customerEmail || args.customerName
            ? {
                ...(args.customerName ? { name: args.customerName } : {}),
                ...(args.customerEmail ? { email: args.customerEmail } : {}),
              }
            : undefined,
        tags: ['gcfis', 'agent_escalation'],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zendesk ticket creation failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as ZendeskTicketResponse;
  return {
    ...(payload.ticket?.id ? { ticketId: String(payload.ticket.id) } : {}),
    ...(payload.ticket?.url ? { ticketUrl: payload.ticket.url } : {}),
  };
}

interface FreshdeskTicketResponse {
  id?: number;
}

async function createFreshdeskTicket(args: {
  domain: string;
  apiKey: string;
  subject: string;
  body: string;
  customerEmail?: string;
  customerName?: string;
}): Promise<{ ticketId?: string; ticketUrl?: string }> {
  const endpoint = `https://${args.domain}.freshdesk.com/api/v2/tickets`;
  const auth = Buffer.from(`${args.apiKey}:X`).toString('base64');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      subject: args.subject,
      description: args.body,
      priority: 2, // Medium
      status: 2,   // Open
      ...(args.customerEmail ? { email: args.customerEmail } : {}),
      ...(args.customerName ? { name: args.customerName } : {}),
      tags: ['gcfis', 'agent_escalation'],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Freshdesk ticket creation failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as FreshdeskTicketResponse;
  const ticketId = payload.id ? String(payload.id) : undefined;
  return {
    ...(ticketId ? { ticketId } : {}),
    ...(ticketId ? { ticketUrl: `https://${args.domain}.freshdesk.com/helpdesk/tickets/${ticketId}` } : {}),
  };
}

export async function createSupportTicket(input: CreateSupportTicketInput): Promise<CreateSupportTicketResult> {
  const db = getDb();
  const integration = await getSupportIntegrationForBusiness(input.businessId);

  const SUPPORTED_PROVIDERS = new Set(['zendesk', 'freshdesk']);
  if (!SUPPORTED_PROVIDERS.has(integration.provider)) {
    await db.insert(supportTickets).values({
      businessId: input.businessId,
      conversationId: input.conversationId,
      provider: integration.provider,
      status: 'failed',
      reason: input.reason,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      customerMessage: input.customerMessage,
      assistantMessage: input.assistantMessage,
      errorMessage: 'Support integration not configured. Enable support_escalation skill and connect Zendesk or Freshdesk.',
      metadata: input.metadata,
    });

    return {
      status: 'failed',
      provider: integration.provider,
      message: 'Support integration not configured. Enable support_escalation skill and connect Zendesk or Freshdesk.',
    };
  }

  // Validate provider-specific config fields
  const missingConfig = (() => {
    if (!integration.accessToken) return 'API token is required.';
    if (integration.provider === 'freshdesk') {
      if (typeof integration.config?.['domain'] !== 'string' || !integration.config['domain'].trim()) {
        return 'Freshdesk domain is required.';
      }
      return null;
    }
    // zendesk
    if (typeof integration.config?.subdomain !== 'string' || !integration.config.subdomain.trim()) {
      return 'Zendesk subdomain is required.';
    }
    if (typeof integration.config?.supportEmail !== 'string' || !integration.config.supportEmail.trim()) {
      return 'Zendesk support email is required.';
    }
    return null;
  })();

  if (missingConfig) {
    await db.insert(supportTickets).values({
      businessId: input.businessId,
      conversationId: input.conversationId,
      provider: integration.provider,
      status: 'failed',
      reason: input.reason,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      customerMessage: input.customerMessage,
      assistantMessage: input.assistantMessage,
      errorMessage: missingConfig,
      metadata: input.metadata,
    });

    return {
      status: 'failed',
      provider: integration.provider,
      message: missingConfig,
    };
  }

  const subject = `Escalation from ${input.customerName ?? input.customerEmail ?? 'website visitor'}`;
  const body = [
    `Reason: ${input.reason}`,
    input.customerName ? `Customer name: ${input.customerName}` : null,
    input.customerEmail ? `Customer email: ${input.customerEmail}` : null,
    '',
    'Customer message:',
    input.customerMessage,
    input.assistantMessage ? `\nAgent response:\n${input.assistantMessage}` : null,
  ]
    .filter((line): line is string => !!line)
    .join('\n');

  try {
    const external = await (() => {
      if (integration.provider === 'freshdesk') {
        return createFreshdeskTicket({
          domain: (integration.config!['domain'] as string).trim(),
          apiKey: integration.accessToken!,
          subject,
          body,
          ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
          ...(input.customerName ? { customerName: input.customerName } : {}),
        });
      }
      return createZendeskTicket({
        subdomain: (integration.config!.subdomain as string).trim(),
        supportEmail: (integration.config!.supportEmail as string).trim(),
        apiToken: integration.accessToken!,
        subject,
        body,
        ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
        ...(input.customerName ? { customerName: input.customerName } : {}),
      });
    })();

    await db.insert(supportTickets).values({
      businessId: input.businessId,
      conversationId: input.conversationId,
      provider: integration.provider,
      status: 'created',
      reason: input.reason,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      customerMessage: input.customerMessage,
      assistantMessage: input.assistantMessage,
      externalTicketId: external.ticketId,
      externalTicketUrl: external.ticketUrl,
      metadata: input.metadata,
    });

    return {
      status: 'created',
      provider: integration.provider,
      ...(external.ticketId ? { externalTicketId: external.ticketId } : {}),
      ...(external.ticketUrl ? { externalTicketUrl: external.ticketUrl } : {}),
      message: 'Support ticket created',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.insert(supportTickets).values({
      businessId: input.businessId,
      conversationId: input.conversationId,
      provider: integration.provider,
      status: 'failed',
      reason: input.reason,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      customerMessage: input.customerMessage,
      assistantMessage: input.assistantMessage,
      errorMessage: message,
      metadata: input.metadata,
    });

    return {
      status: 'failed',
      provider: integration.provider,
      message,
    };
  }
}
