import { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '@pnpbrain/db/client';
import { businessCreditLedger, businesses, businessMembers } from '@pnpbrain/db/schema';
import { eq } from 'drizzle-orm';
import { createBusiness, getBusinessByOwner } from '../lib/business';
import { logger } from '../lib/logger';
import { requireSupabaseAuth } from '../middleware/auth';

interface PostgresErrorLike {
  code?: string;
  constraint?: string;
  constraint_name?: string;
  detail?: string;
  message?: string;
}

function getPostgresError(error: unknown): PostgresErrorLike | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  return error as PostgresErrorLike;
}

function isUniqueViolation(error: unknown): boolean {
  return getPostgresError(error)?.code === '23505';
}

function hasSlugConflictHint(error: unknown): boolean {
  const pgError = getPostgresError(error);
  const hint = [pgError?.constraint_name, pgError?.constraint, pgError?.detail, pgError?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return hint.includes('slug');
}

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

    try {
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

      let business;

      try {
        business = await createBusiness({
          name: parsed.data.name,
          slug: parsed.data.slug,
          ownerUserId: auth.userId,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const recoveredBusiness = await getBusinessByOwner(auth.userId);
          if (recoveredBusiness) {
            logger.warn('auth_register_duplicate_create_recovered', {
              userId: auth.userId,
              businessId: recoveredBusiness.id,
              slug: recoveredBusiness.slug,
              requestedSlug: parsed.data.slug,
            });
            return res.status(200).json({ ok: true, data: recoveredBusiness });
          }

          if (hasSlugConflictHint(error)) {
            logger.warn('auth_register_slug_conflict_after_insert', {
              userId: auth.userId,
              requestedSlug: parsed.data.slug,
            });
            return res.status(409).json({ ok: false, error: 'That slug is already taken. Choose another.' });
          }
        }

        logger.error('auth_register_create_business_failed', {
          userId: auth.userId,
          email: auth.email,
          requestedSlug: parsed.data.slug,
          error,
        });
        return res.status(500).json({ ok: false, error: `Failed to provision business : ${error instanceof Error ? error.message : 'Unknown error caught in auth.register'}` });
      }

      logger.info('auth_register_business_created', {
        userId: auth.userId,
        businessId: business.id,
        slug: business.slug,
      });

      try {
        const db2 = getDb();

        await db2
          .insert(businessMembers)
          .values({ businessId: business.id, userId: auth.userId, email: auth.email || '', role: 'owner' })
          .onConflictDoNothing();

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
      } catch (bootstrapError) {
        logger.warn('auth_register_bootstrap_failed', {
          userId: auth.userId,
          businessId: business.id,
          error: bootstrapError,
        });
      }

      return res.status(201).json({ ok: true, data: business });
    } catch (error) {
      logger.error('auth_register_failed', {
        userId: auth.userId,
        email: auth.email,
        requestedSlug: parsed.data.slug,
        error,
      });
      return res.status(500).json({ ok: false, error: `Failed to provision business : ${error instanceof Error ? error.message : 'Unknown error caught in auth.register2'}` });
    }
  };
}
