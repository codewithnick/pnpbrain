import { getDb } from '@gcfis/db/client';
import { leadHandoffs } from '@gcfis/db/schema';
import { getLeadHandoffIntegrationForAgentScope } from './businessSkills';

export interface CreateLeadHandoffInput {
  businessId: string;
  agentId?: string;
  conversationId: string;
  reason: string;
  qualificationScore?: number;
  qualificationStage?: 'nurture' | 'mql' | 'sql';
  customerMessage: string;
  summary: string;
  customerEmail?: string;
  customerName?: string;
  companyName?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateLeadHandoffResult {
  status: 'created' | 'failed';
  provider: string;
  externalRecordId?: string;
  externalRecordUrl?: string;
  message: string;
}

interface HubSpotCreateContactResponse {
  id?: string;
}

async function createHubSpotContact(args: {
  accessToken: string;
  portalId?: string;
  customerEmail?: string;
  customerName?: string;
  companyName?: string;
  qualificationScore?: number;
  qualificationStage?: 'nurture' | 'mql' | 'sql';
}): Promise<{ recordId?: string; recordUrl?: string }> {
  if (!args.customerEmail) {
    throw new Error('HubSpot requires a customer email to create a lead handoff.');
  }

  const [firstName, ...rest] = (args.customerName ?? '').trim().split(/\s+/).filter(Boolean);
  const lastName = rest.join(' ');

  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        email: args.customerEmail,
        ...(firstName ? { firstname: firstName } : {}),
        ...(lastName ? { lastname: lastName } : {}),
        ...(args.companyName ? { company: args.companyName } : {}),
        ...(typeof args.qualificationScore === 'number'
          ? { lifecyclestage: args.qualificationScore >= 75 ? 'opportunity' : 'lead' }
          : {}),
        hs_lead_status: args.qualificationStage ?? 'new',
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HubSpot contact creation failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as HubSpotCreateContactResponse;
  return {
    ...(payload.id ? { recordId: payload.id } : {}),
    ...(payload.id && args.portalId
      ? { recordUrl: `https://app.hubspot.com/contacts/${args.portalId}/contact/${payload.id}` }
      : {}),
  };
}

async function triggerZapierWebhook(args: {
  webhookUrl: string;
  payload: Record<string, unknown>;
}): Promise<{ recordId?: string; recordUrl?: string }> {
  const response = await fetch(args.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args.payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zapier webhook failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return {};
}

export async function createLeadHandoff(input: CreateLeadHandoffInput): Promise<CreateLeadHandoffResult> {
  const db = getDb();
  const integration = await getLeadHandoffIntegrationForAgentScope({
    businessId: input.businessId,
    ...(input.agentId ? { agentId: input.agentId } : {}),
  });

  const supportedProviders = new Set(['hubspot', 'zapier']);
  if (!supportedProviders.has(integration.provider)) {
    await db.insert(leadHandoffs).values({
      businessId: input.businessId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      provider: integration.provider,
      status: 'failed',
      reason: input.reason,
      qualificationScore: input.qualificationScore,
      qualificationStage: input.qualificationStage,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      companyName: input.companyName,
      summary: input.summary,
      errorMessage: 'Lead handoff integration not configured. Connect HubSpot or Zapier.',
      metadata: input.metadata,
    });

    return {
      status: 'failed',
      provider: integration.provider,
      message: 'Lead handoff integration not configured. Connect HubSpot or Zapier.',
    };
  }

  const missingConfig = (() => {
    if (integration.provider === 'hubspot') {
      if (!integration.accessToken) return 'HubSpot access token is required.';
      if (!input.customerEmail) return 'HubSpot handoff requires a customer email.';
      return null;
    }

    if (typeof integration.config?.webhookUrl !== 'string' || !integration.config.webhookUrl.trim()) {
      return 'Zapier webhook URL is required.';
    }
    return null;
  })();

  if (missingConfig) {
    await db.insert(leadHandoffs).values({
      businessId: input.businessId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      provider: integration.provider,
      status: 'failed',
      reason: input.reason,
      qualificationScore: input.qualificationScore,
      qualificationStage: input.qualificationStage,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      companyName: input.companyName,
      summary: input.summary,
      errorMessage: missingConfig,
      metadata: input.metadata,
    });

    return {
      status: 'failed',
      provider: integration.provider,
      message: missingConfig,
    };
  }

  try {
    const external = await (() => {
      if (integration.provider === 'hubspot') {
        return createHubSpotContact({
          accessToken: integration.accessToken!,
          ...(typeof integration.config?.portalId === 'string'
            ? { portalId: integration.config.portalId }
            : {}),
          ...(input.customerEmail !== undefined ? { customerEmail: input.customerEmail } : {}),
          ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
          ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
          ...(input.qualificationScore !== undefined
            ? { qualificationScore: input.qualificationScore }
            : {}),
          ...(input.qualificationStage !== undefined
            ? { qualificationStage: input.qualificationStage }
            : {}),
        });
      }

      return triggerZapierWebhook({
        webhookUrl: String(integration.config!.webhookUrl).trim(),
        payload: {
          businessId: input.businessId,
          agentId: input.agentId,
          conversationId: input.conversationId,
          provider: integration.provider,
          reason: input.reason,
          qualificationScore: input.qualificationScore,
          qualificationStage: input.qualificationStage,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          companyName: input.companyName,
          summary: input.summary,
          metadata: input.metadata ?? {},
        },
      });
    })();

    await db.insert(leadHandoffs).values({
      businessId: input.businessId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      provider: integration.provider,
      status: 'created',
      reason: input.reason,
      qualificationScore: input.qualificationScore,
      qualificationStage: input.qualificationStage,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      companyName: input.companyName,
      summary: input.summary,
      externalRecordId: external.recordId,
      externalRecordUrl: external.recordUrl,
      metadata: input.metadata,
    });

    return {
      status: 'created',
      provider: integration.provider,
      ...(external.recordId ? { externalRecordId: external.recordId } : {}),
      ...(external.recordUrl ? { externalRecordUrl: external.recordUrl } : {}),
      message: 'Lead handoff created',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.insert(leadHandoffs).values({
      businessId: input.businessId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      provider: integration.provider,
      status: 'failed',
      reason: input.reason,
      qualificationScore: input.qualificationScore,
      qualificationStage: input.qualificationStage,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      companyName: input.companyName,
      summary: input.summary,
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