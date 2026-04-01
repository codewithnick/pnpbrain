import { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '@gcfis/db/client';
import { businesses, businessMembers } from '@gcfis/db/schema';
import { eq } from 'drizzle-orm';
import { requireSupabaseAuth } from '../middleware/auth';
import { createBusiness, getBusinessByOwner } from '../lib/business';

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
});

export class AuthController {
  public readonly register = async (req: Request, res: Response) => {
    const auth = await requireSupabaseAuth(req, res);
    if (!auth) return;

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const existing = await getBusinessByOwner(auth.userId);
    if (existing) {
      const { llmApiKey: _ignored, ...safe } = existing;
      return res.status(200).json({ ok: true, data: safe });
    }

    const db = getDb();
    const [slugConflict] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, parsed.data.slug))
      .limit(1);

    if (slugConflict) {
      return res.status(409).json({ ok: false, error: 'That slug is already taken. Choose another.' });
    }

    const business = await createBusiness({
      name: parsed.data.name,
      slug: parsed.data.slug,
      ownerUserId: auth.userId,
    });

    // Create the owner membership row for RBAC resolution
    const db2 = getDb();
    await db2
      .insert(businessMembers)
      .values({ businessId: business.id, userId: auth.userId, email: '', role: 'owner' })
      .onConflictDoNothing();

    const { llmApiKey: _ignored, ...safe } = business;
    return res.status(201).json({ ok: true, data: safe });
  };
}
