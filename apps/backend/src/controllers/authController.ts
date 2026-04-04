import { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '@pnpbrain/db/client';
import { businessCreditLedger, businesses, businessMembers } from '@pnpbrain/db/schema';
import { eq } from 'drizzle-orm';
import { createBusiness, getBusinessByOwner } from '../lib/business';
import { logger } from '../lib/logger';
import { requireSupabaseAuth } from '../middleware/auth';

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

    logger.info('auth_register_started', {
      userId: auth.userId,
      email: auth.email,
      requestedSlug: req.body?.slug ?? null,
    });

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      logger.warn('auth_register_validation_failed', {
        userId: auth.userId,
        email: auth.email,
        issues,
      });
      return res.status(400).json({ ok: false, error: issues.join(', ') });
    }

    const existing = await getBusinessByOwner(auth.userId);
    if (existing) {
      logger.info('auth_register_existing_business_returned', {
        userId: auth.userId,
        businessId: existing.id,
        slug: existing.slug,
      });
      return res.status(200).json({ ok: true, data: existing });
    }

    const db = getDb();
    const [slugConflict] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, parsed.data.slug))
      .limit(1);

    if (slugConflict) {
      logger.warn('auth_register_slug_conflict', {
        userId: auth.userId,
        requestedSlug: parsed.data.slug,
      });
      return res.status(409).json({ ok: false, error: 'That slug is already taken. Choose another.' });
    }

    const business = await createBusiness({
      name: parsed.data.name,
      slug: parsed.data.slug,
      ownerUserId: auth.userId,
    });

    logger.info('auth_register_business_created', {
      userId: auth.userId,
      businessId: business.id,
      slug: business.slug,
    });

    // Create the owner membership row for RBAC resolution
    const db2 = getDb();
    await db2
      .insert(businessMembers)
      .values({ businessId: business.id, userId: auth.userId, email: '', role: 'owner' })
      .onConflictDoNothing();

    // Bootstrap initial signup credits for the business.
    await db2
      .insert(businessCreditLedger)
      .values({
        businessId: business.id,
        amount: business.signupCreditsGranted,
        balanceAfter: business.creditBalance,
        reason: 'signup_bonus',
        createdByUserId: auth.userId,
        metadata: {
          source: 'auth.register',
        },
      })
      .onConflictDoNothing();

    return res.status(201).json({ ok: true, data: business });
  };
}
