import { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '@pnpbrain/db/client';
import { agents, businesses } from '@pnpbrain/db/schema';
import { eq } from 'drizzle-orm';
import {
  generatePublicChatToken,
  getBusinessBySlug,
  isAllowedHostname,
  parseAllowedDomains,
} from '../lib/business';
import { resolveAgentForBusiness } from '../lib/agents';

const widgetSessionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
}).strict();

function extractOriginHostname(origin: string | undefined): string | null {
  if (!origin) {
    return null;
  }

  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

interface PublicLookupResult {
  business: Awaited<ReturnType<typeof getBusinessBySlug>>;
  agentId?: string;
  ambiguous?: boolean;
}

async function resolvePublicTarget(slugOrAgent: string): Promise<PublicLookupResult> {
  const business = await getBusinessBySlug(slugOrAgent);
  if (business) {
    return { business };
  }

  const db = getDb();
  const matches = await db
    .select({
      business: businesses,
      agentId: agents.id,
    })
    .from(agents)
    .innerJoin(businesses, eq(agents.businessId, businesses.id))
    .where(eq(agents.slug, slugOrAgent))
    .limit(2);

  if (matches.length === 0) {
    return { business: null };
  }

  if (matches.length > 1) {
    return { business: null, ambiguous: true };
  }

  const firstMatch = matches[0];
  if (!firstMatch) {
    return { business: null };
  }

  return firstMatch.agentId
    ? { business: firstMatch.business, agentId: firstMatch.agentId }
    : { business: firstMatch.business };
}

export class PublicController {
  public readonly getBusinessBySlug = async (req: Request, res: Response) => {
    const slug = req.params['slug'];
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ ok: false, error: 'Invalid slug' });
    }

    const lookup = await resolvePublicTarget(slug);
    if (lookup.ambiguous) {
      return res.status(409).json({
        ok: false,
        error: 'Ambiguous agent identifier. Use the business slug or provide an explicit agentId.',
      });
    }

    const business = lookup.business;
    if (!business) {
      return res.status(404).json({ ok: false, error: 'Business not found' });
    }

    const requestedAgentId =
      typeof req.query['agentId'] === 'string' ? req.query['agentId'] : lookup.agentId;
    const agent = await resolveAgentForBusiness(business.id, requestedAgentId);
    if (!agent) {
      return res.status(409).json({
        ok: false,
        error: 'No default agent is configured for this business. Create an agent and mark one as default.',
      });
    }

    return res.json({
      ok: true,
      data: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        agentId: agent.id,
        botName: agent.botName,
        welcomeMessage: agent.welcomeMessage,
        placeholder: agent.placeholder,
        primaryColor: agent.primaryColor,
        widgetPosition: agent.widgetPosition,
        widgetTheme: agent.widgetTheme,
        showAvatar: agent.showAvatar,
        assistantAvatarMode: agent.assistantAvatarMode,
        assistantAvatarText: agent.assistantAvatarText,
        assistantAvatarImageUrl: agent.assistantAvatarImageUrl,
        showAssistantAvatar: agent.showAssistantAvatar,
        showUserAvatar: agent.showUserAvatar,
        userAvatarText: agent.userAvatarText,
        headerSubtitle: agent.headerSubtitle,
        chatBackgroundColor: agent.chatBackgroundColor,
        userMessageColor: agent.userMessageColor,
        assistantMessageColor: agent.assistantMessageColor,
        borderRadiusPx: agent.borderRadiusPx,
        showPoweredBy: agent.showPoweredBy,
        publicChatToken: generatePublicChatToken(business, { agentId: agent.id }),
      },
    });
  };

  public readonly createWidgetSession = async (req: Request, res: Response) => {
    const parsed = widgetSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((issue) => issue.message).join(', ') });
    }

    const lookup = await resolvePublicTarget(parsed.data.slug);
    if (lookup.ambiguous) {
      return res.status(409).json({
        ok: false,
        error: 'Ambiguous agent identifier. Use the business slug or provide an explicit agentId.',
      });
    }

    const business = lookup.business;

    if (!business) {
      return res.status(404).json({ ok: false, error: 'Business not found' });
    }

    const requestedAgentId =
      typeof req.query['agentId'] === 'string' ? req.query['agentId'] : lookup.agentId;
    const agent = await resolveAgentForBusiness(business.id, requestedAgentId);
    if (!agent) {
      return res.status(409).json({
        ok: false,
        error: 'No default agent is configured for this business. Create an agent and mark one as default.',
      });
    }

    const allowedDomains = parseAllowedDomains(agent.allowedDomains);
    const originHostname = extractOriginHostname(req.header('origin'));
    if (allowedDomains.length > 0 && (!originHostname || !isAllowedHostname(originHostname, allowedDomains))) {
      return res.status(401).json({ ok: false, error: 'Origin is not allowed for this business' });
    }

    return res.json({
      ok: true,
      data: {
        slug: business.slug,
        agentId: agent.id,
        botName: agent.botName,
        welcomeMessage: agent.welcomeMessage,
        placeholder: agent.placeholder,
        primaryColor: agent.primaryColor,
        widgetTheme: agent.widgetTheme,
        widgetPosition: agent.widgetPosition,
        showAvatar: agent.showAvatar,
        assistantAvatarMode: agent.assistantAvatarMode,
        assistantAvatarText: agent.assistantAvatarText,
        assistantAvatarImageUrl: agent.assistantAvatarImageUrl,
        showAssistantAvatar: agent.showAssistantAvatar,
        showUserAvatar: agent.showUserAvatar,
        userAvatarText: agent.userAvatarText,
        headerSubtitle: agent.headerSubtitle,
        chatBackgroundColor: agent.chatBackgroundColor,
        userMessageColor: agent.userMessageColor,
        assistantMessageColor: agent.assistantMessageColor,
        borderRadiusPx: agent.borderRadiusPx,
        showPoweredBy: agent.showPoweredBy,
        publicChatToken: generatePublicChatToken(business, { agentId: agent.id }),
      },
    });
  };
}
