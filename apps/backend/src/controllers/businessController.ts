import { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '@gcfis/db/client';
import { businesses } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';
import { requireSupabaseAuth } from '../middleware/auth';
import { getBusinessByOwner, normalizeAllowedDomains, updateBusiness } from '../lib/business';

const LLM_PROVIDERS = ['ollama', 'openai', 'anthropic'] as const;
const SKILL_NAMES = ['calculator', 'datetime', 'firecrawl'] as const;
const POSITIONS = ['bottom-right', 'bottom-left'] as const;
const THEMES = ['light', 'dark'] as const;

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).optional(),
  llmProvider: z.enum(LLM_PROVIDERS).optional(),
  llmModel: z.string().min(1).max(80).optional(),
  llmApiKey: z.string().max(200).optional().nullable(),
  llmBaseUrl: z.string().url().optional().nullable(),
  enabledSkills: z.array(z.enum(SKILL_NAMES)).optional(),
  allowedDomains: z.array(z.string().min(1)).max(50).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).optional(),
  botName: z.string().min(1).max(60).optional(),
  welcomeMessage: z.string().max(200).optional(),
  widgetPosition: z.enum(POSITIONS).optional(),
  widgetTheme: z.enum(THEMES).optional(),
  showAvatar: z.boolean().optional(),
});

export class BusinessController {
  public readonly getMe = async (req: Request, res: Response) => {
    const auth = await requireSupabaseAuth(req, res);
    if (!auth) return;

    const business = await getBusinessByOwner(auth.userId);
    if (!business) {
      return res.status(404).json({ ok: false, error: 'No business found. Complete onboarding first.' });
    }

    const { llmApiKey: _ignored, ...safe } = business;
    return res.json({ ok: true, data: safe });
  };

  public readonly updateMe = async (req: Request, res: Response) => {
    const auth = await requireSupabaseAuth(req, res);
    if (!auth) return;

    const business = await getBusinessByOwner(auth.userId);
    if (!business) {
      return res.status(404).json({ ok: false, error: 'No business found. Complete onboarding first.' });
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const updates = parsed.data as Record<string, unknown>;

    if (parsed.data.slug && parsed.data.slug !== business.slug) {
      const db = getDb();
      const [slugConflict] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.slug, parsed.data.slug))
        .limit(1);

      if (slugConflict) {
        return res.status(409).json({ ok: false, error: 'That slug is already taken.' });
      }
    }

    if (parsed.data.allowedDomains) {
      updates['allowedDomains'] = JSON.stringify(normalizeAllowedDomains(parsed.data.allowedDomains));
    }

    if (parsed.data.enabledSkills) {
      updates['enabledSkills'] = JSON.stringify(parsed.data.enabledSkills);
    }

    const updated = await updateBusiness(business.id, updates);
    if (!updated) {
      return res.status(500).json({ ok: false, error: 'Failed to update business' });
    }

    const { llmApiKey: _ignored, ...safe } = updated;
    return res.json({ ok: true, data: safe });
  };
}
