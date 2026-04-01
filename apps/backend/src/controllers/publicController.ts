import { Request, Response } from 'express';
import { z } from 'zod';
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

export class PublicController {
  public readonly getBusinessBySlug = async (req: Request, res: Response) => {
    const slug = req.params['slug'];
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ ok: false, error: 'Invalid slug' });
    }

    const business = await getBusinessBySlug(slug);
    if (!business) {
      return res.status(404).json({ ok: false, error: 'Business not found' });
    }

    const requestedAgentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'] : undefined;
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
        primaryColor: agent.primaryColor,
        widgetPosition: agent.widgetPosition,
        widgetTheme: agent.widgetTheme,
        showAvatar: agent.showAvatar,
        publicChatToken: generatePublicChatToken(business),
      },
    });
  };

  public readonly createWidgetSession = async (req: Request, res: Response) => {
    const parsed = widgetSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((issue) => issue.message).join(', ') });
    }

    const business = await getBusinessBySlug(parsed.data.slug);

    if (!business) {
      return res.status(404).json({ ok: false, error: 'Business not found' });
    }

    const requestedAgentId = typeof req.query['agentId'] === 'string' ? req.query['agentId'] : undefined;
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
        primaryColor: agent.primaryColor,
        widgetTheme: agent.widgetTheme,
        widgetPosition: agent.widgetPosition,
        showAvatar: agent.showAvatar,
        publicChatToken: generatePublicChatToken(business),
      },
    });
  };
}
