import { Request, Response } from 'express';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@pnpbrain/db/client';
import { agents } from '@pnpbrain/db/schema';
import { requireBusinessAuth } from '../middleware/auth';
import { generateAgentApiKey } from '../lib/agents';
import { parseAllowedDomains } from '../lib/business';
import {
  getAllIntegrationsForAgentScope,
  getEnabledSkillsForAgentScope,
  setEnabledSkillsForAgent,
} from '../lib/businessSkills';

const createAgentSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500).optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  enabledSkills: z.array(z.string()).max(32).optional(),
  llmProvider: z.string().max(50).optional(),
  llmModel: z.string().max(120).optional(),
  llmApiKey: z.string().max(500).nullable().optional(),
  llmBaseUrl: z.string().url().nullable().optional(),
  allowedDomains: z.array(z.string().min(1)).max(50).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).optional(),
  botName: z.string().min(1).max(60).optional(),
  welcomeMessage: z.string().max(200).optional(),
  placeholder: z.string().max(120).optional(),
  widgetPosition: z.enum(['bottom-right', 'bottom-left']).optional(),
  widgetTheme: z.enum(['light', 'dark']).optional(),
  showAvatar: z.boolean().optional(),
  assistantAvatarMode: z.enum(['initial', 'emoji', 'image']).optional(),
  assistantAvatarText: z.string().min(1).max(8).optional(),
  assistantAvatarImageUrl: z.string().url().nullable().optional(),
  showAssistantAvatar: z.boolean().optional(),
  showUserAvatar: z.boolean().optional(),
  userAvatarText: z.string().min(1).max(12).optional(),
  headerSubtitle: z.string().max(80).optional(),
  chatBackgroundColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).optional(),
  userMessageColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).nullable().optional(),
  assistantMessageColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).optional(),
  borderRadiusPx: z.number().int().min(8).max(32).optional(),
  showPoweredBy: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const archiveAgentSchema = z.object({
  archived: z.boolean(),
});

export class AgentsController {
  public readonly list = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'viewer');
    if (!auth) return;

    const includeArchived = req.query['includeArchived'] === 'true';

    const whereClause = includeArchived
      ? eq(agents.businessId, auth.businessId)
      : and(eq(agents.businessId, auth.businessId), isNull(agents.archivedAt));

    const db = getDb();
    const rows = await db
      .select()
      .from(agents)
      .where(whereClause)
      .orderBy(asc(agents.createdAt));

    const enriched = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        allowedDomains: parseAllowedDomains(row.allowedDomains),
        enabledSkills: await getEnabledSkillsForAgentScope({
          businessId: auth.businessId,
          agentId: row.id,
        }),
        integrations: await getAllIntegrationsForAgentScope({
          businessId: auth.businessId,
          agentId: row.id,
        }),
      }))
    );

    return res.json({ ok: true, data: enriched });
  };

  public readonly create = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const db = getDb();
    const [slugConflict] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.businessId, auth.businessId), eq(agents.slug, parsed.data.slug)))
      .limit(1);

    if (slugConflict) {
      return res.status(409).json({ ok: false, error: 'That agent slug already exists for this business.' });
    }

    const [created] = await db
      .insert(agents)
      .values({
        businessId: auth.businessId,
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description ?? '',
        agentApiKey: generateAgentApiKey(),
      })
      .returning();

    if (!created) {
      return res.status(500).json({ ok: false, error: 'Failed to create agent' });
    }

    return res.status(201).json({ ok: true, data: created });
  };

  public readonly update = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const agentId = req.params['agentId'];
    if (!agentId) {
      return res.status(400).json({ ok: false, error: 'Missing agentId' });
    }

    const parsed = updateAgentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const db = getDb();

    const [target] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.businessId, auth.businessId)))
      .limit(1);

    if (!target) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }

    if (parsed.data.isDefault === true) {
      await db
        .update(agents)
        .set({ isDefault: false, updatedAt: sql`now()` })
        .where(eq(agents.businessId, auth.businessId));
    }

    const payload = { ...parsed.data } as Record<string, unknown>;
    delete payload['enabledSkills'];
    if (parsed.data.allowedDomains) {
      payload['allowedDomains'] = JSON.stringify(parsed.data.allowedDomains);
    }

    const [updated] = await db
      .update(agents)
      .set({ ...payload, updatedAt: sql`now()` })
      .where(and(eq(agents.id, agentId), eq(agents.businessId, auth.businessId)))
      .returning();

    if (!updated) {
      return res.status(500).json({ ok: false, error: 'Failed to update agent' });
    }

    if (parsed.data.enabledSkills) {
      await setEnabledSkillsForAgent(agentId, parsed.data.enabledSkills);
    }

    return res.json({
      ok: true,
      data: {
        ...updated,
        allowedDomains: parseAllowedDomains(updated.allowedDomains),
      },
    });
  };

  public readonly archive = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const agentId = req.params['agentId'];
    if (!agentId) {
      return res.status(400).json({ ok: false, error: 'Missing agentId' });
    }

    const parsed = archiveAgentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const db = getDb();
    const [target] = await db
      .select({ id: agents.id, isDefault: agents.isDefault, archivedAt: agents.archivedAt })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.businessId, auth.businessId)))
      .limit(1);

    if (!target) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }

    if (parsed.data.archived && target.isDefault) {
      await db
        .update(agents)
        .set({ isDefault: false, updatedAt: sql`now()` })
        .where(and(eq(agents.id, agentId), eq(agents.businessId, auth.businessId)));
    }

    const [updated] = await db
      .update(agents)
      .set({
        archivedAt: parsed.data.archived ? sql`now()` : null,
        updatedAt: sql`now()`,
      })
      .where(and(eq(agents.id, agentId), eq(agents.businessId, auth.businessId)))
      .returning();

    if (!updated) {
      return res.status(500).json({ ok: false, error: 'Failed to update agent archive status' });
    }

    return res.json({
      ok: true,
      data: {
        ...updated,
        allowedDomains: parseAllowedDomains(updated.allowedDomains),
      },
    });
  };

  public readonly remove = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const agentId = req.params['agentId'];
    if (!agentId) {
      return res.status(400).json({ ok: false, error: 'Missing agentId' });
    }

    const db = getDb();

    const [target] = await db
      .select({ id: agents.id, isDefault: agents.isDefault })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.businessId, auth.businessId)))
      .limit(1);

    if (!target) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }

    const [deleted] = await db
      .delete(agents)
      .where(and(eq(agents.id, agentId), eq(agents.businessId, auth.businessId)))
      .returning({ id: agents.id });

    if (!deleted) {
      return res.status(500).json({ ok: false, error: 'Failed to delete agent' });
    }

    return res.json({ ok: true, data: { id: deleted.id } });
  };
}
