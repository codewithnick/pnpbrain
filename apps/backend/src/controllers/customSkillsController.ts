import { Request, Response } from 'express';
import { z } from 'zod';
import { requireBusinessAuth } from '../middleware/auth';
import {
  agentBelongsToBusiness,
  createCustomSkill,
  deleteCustomSkill,
  getCustomSkillsForAgent,
  normalizeSkillKey,
  updateCustomSkill,
} from '../lib/customSkills';

const createSchema = z.object({
  key: z.string().min(1).max(48).optional(),
  name: z.string().min(2).max(80),
  description: z.string().max(600).optional(),
  webhookUrl: z.string().url(),
  inputSchema: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const updateSchema = z.object({
  key: z.string().min(1).max(48).optional(),
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(600).optional(),
  webhookUrl: z.string().url().optional(),
  inputSchema: z.record(z.unknown()).nullable().optional(),
  enabled: z.boolean().optional(),
});

const skillIdSchema = z.object({
  skillId: z.string().uuid(),
});

const testWebhookSchema = z.object({
  webhookUrl: z.string().url(),
  key: z.string().min(1).max(48).optional(),
  name: z.string().min(1).max(80).optional(),
  input: z.record(z.unknown()).optional(),
});

export class CustomSkillsController {
  public readonly list = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'viewer');
    if (!auth) return;

    const agentId = req.params['agentId'];
    if (!agentId) {
      return res.status(400).json({ ok: false, error: 'Missing agentId' });
    }

    const scoped = await agentBelongsToBusiness({ businessId: auth.businessId, agentId });
    if (!scoped) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }

    const rows = await getCustomSkillsForAgent({ businessId: auth.businessId, agentId });
    return res.json({ ok: true, data: rows });
  };

  public readonly create = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const agentId = req.params['agentId'];
    if (!agentId) {
      return res.status(400).json({ ok: false, error: 'Missing agentId' });
    }

    const scoped = await agentBelongsToBusiness({ businessId: auth.businessId, agentId });
    if (!scoped) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }

    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const skillKey = normalizeSkillKey(parsed.data.key ?? parsed.data.name);
    if (!skillKey) {
      return res.status(400).json({ ok: false, error: 'Skill key is invalid after normalization' });
    }

    try {
      const created = await createCustomSkill({
        businessId: auth.businessId,
        agentId,
        skillKey,
        name: parsed.data.name,
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        webhookUrl: parsed.data.webhookUrl,
        ...(parsed.data.inputSchema !== undefined ? { inputSchema: parsed.data.inputSchema } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      });

      return res.status(201).json({ ok: true, data: created });
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
        return res.status(409).json({ ok: false, error: 'A custom skill with this key already exists for this agent' });
      }
      throw error;
    }
  };

  public readonly update = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const agentId = req.params['agentId'];
    if (!agentId) {
      return res.status(400).json({ ok: false, error: 'Missing agentId' });
    }

    const idParsed = skillIdSchema.safeParse({ skillId: req.params['skillId'] });
    if (!idParsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid skillId' });
    }

    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const nextKey = parsed.data.key !== undefined ? normalizeSkillKey(parsed.data.key) : undefined;
    if (parsed.data.key !== undefined && !nextKey) {
      return res.status(400).json({ ok: false, error: 'Skill key is invalid after normalization' });
    }

    try {
      const updated = await updateCustomSkill({
        businessId: auth.businessId,
        agentId,
        skillId: idParsed.data.skillId,
        ...(nextKey !== undefined ? { skillKey: nextKey } : {}),
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.webhookUrl !== undefined ? { webhookUrl: parsed.data.webhookUrl } : {}),
        ...(parsed.data.inputSchema !== undefined ? { inputSchema: parsed.data.inputSchema } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      });

      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Custom skill not found' });
      }

      return res.json({ ok: true, data: updated });
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
        return res.status(409).json({ ok: false, error: 'A custom skill with this key already exists for this agent' });
      }
      throw error;
    }
  };

  public readonly remove = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const agentId = req.params['agentId'];
    if (!agentId) {
      return res.status(400).json({ ok: false, error: 'Missing agentId' });
    }

    const idParsed = skillIdSchema.safeParse({ skillId: req.params['skillId'] });
    if (!idParsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid skillId' });
    }

    const deleted = await deleteCustomSkill({
      businessId: auth.businessId,
      agentId,
      skillId: idParsed.data.skillId,
    });

    if (!deleted) {
      return res.status(404).json({ ok: false, error: 'Custom skill not found' });
    }

    return res.json({ ok: true, data: deleted });
  };

  public readonly testWebhook = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'member');
    if (!auth) return;

    const agentId = req.params['agentId'];
    if (!agentId) {
      return res.status(400).json({ ok: false, error: 'Missing agentId' });
    }

    const scoped = await agentBelongsToBusiness({ businessId: auth.businessId, agentId });
    if (!scoped) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }

    const parsed = testWebhookSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(parsed.data.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skill: {
            key: normalizeSkillKey(parsed.data.key ?? parsed.data.name ?? 'custom_skill_test'),
            name: parsed.data.name ?? 'Custom Skill Test',
          },
          context: {
            businessId: auth.businessId,
            agentId,
            conversationId: 'test-conversation',
            mode: 'webhook-test',
          },
          input: parsed.data.input ?? {
            example: 'test',
          },
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';
      const bodyText = contentType.includes('application/json')
        ? JSON.stringify(await response.json(), null, 2)
        : await response.text();

      return res.status(response.ok ? 200 : 502).json({
        ok: response.ok,
        data: {
          status: response.status,
          contentType,
          responsePreview: bodyText.slice(0, 2000),
        },
        ...(response.ok ? {} : { error: `Webhook responded with status ${response.status}` }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(502).json({
        ok: false,
        error: message,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}
