import { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { knowledgeChunks, knowledgeDocuments } from '@gcfis/db/schema';
import { chunkText, getEmbeddingModel } from '@gcfis/agent/rag';
import { S3KnowledgeStorageService } from '../lib/s3-knowledge';
import { requireApiKey, requireBusinessAuth } from '../middleware/auth';

const createDocSchema = z.object({
  businessId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});

export class KnowledgeController {
  public readonly upload = multer({ storage: multer.memoryStorage() });

  public readonly list = async (req: Request, res: Response) => {
    const scope = await this.resolveBusinessScope(req, res, String(req.query['businessId'] ?? '') || null);
    if (!scope) return;

    const db = getDb();
    const docs = await db
      .select({
        id: knowledgeDocuments.id,
        businessId: knowledgeDocuments.businessId,
        title: knowledgeDocuments.title,
        sourceUrl: knowledgeDocuments.sourceUrl,
        s3Bucket: knowledgeDocuments.s3Bucket,
        s3Key: knowledgeDocuments.s3Key,
        contentType: knowledgeDocuments.contentType,
        sizeBytes: knowledgeDocuments.sizeBytes,
        createdAt: knowledgeDocuments.createdAt,
        updatedAt: knowledgeDocuments.updatedAt,
      })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.businessId, scope.businessId))
      .orderBy(knowledgeDocuments.createdAt);

    return res.json({ ok: true, data: docs });
  };

  public readonly create = async (req: Request, res: Response) => {
    const hasMultipart = (req.header('content-type') ?? '').includes('multipart/form-data');
    if (hasMultipart) {
      const title = String(req.body['title'] ?? '').trim();
      const sourceUrl = String(req.body['sourceUrl'] ?? '').trim() || undefined;
      const requestedBusinessId = String(req.body['businessId'] ?? '').trim() || null;

      if (!title) {
        return res.status(400).json({ ok: false, error: 'title is required' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: 'file is required' });
      }

      const scope = await this.resolveBusinessScope(req, res, requestedBusinessId);
      if (!scope) return;

      const allowed = new Set([
        'text/plain',
        'text/markdown',
        'application/json',
        'text/csv',
        'application/xml',
        'text/xml',
      ]);
      if (file.mimetype && !allowed.has(file.mimetype)) {
        return res.status(400).json({ ok: false, error: `Unsupported file type: ${file.mimetype}` });
      }

      const content = file.buffer.toString('utf8');
      if (!content.trim()) {
        return res.status(400).json({ ok: false, error: 'Uploaded file is empty or unsupported. Use UTF-8 text files.' });
      }

      const s3 = new S3KnowledgeStorageService();
      const uploaded = await s3.uploadDocument({
        businessId: scope.businessId,
        title,
        content,
        contentType: file.mimetype || 'text/plain; charset=utf-8',
      });

      const db = getDb();
      const [doc] = await db
        .insert(knowledgeDocuments)
        .values({
          businessId: scope.businessId,
          title,
          content,
          sourceUrl,
          s3Bucket: uploaded.bucket,
          s3Key: uploaded.key,
          contentType: uploaded.contentType,
          sizeBytes: uploaded.sizeBytes,
        })
        .returning();

      if (!doc) {
        return res.status(500).json({ ok: false, error: 'Failed to create document' });
      }

      this.embedDocument(doc.id, scope.businessId, content).catch((err) =>
        console.error('[knowledge] embedding failed:', err)
      );

      return res.status(201).json({ ok: true, data: doc });
    }

    const parsed = createDocSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const scope = await this.resolveBusinessScope(req, res, parsed.data.businessId ?? null);
    if (!scope) return;

    const s3 = new S3KnowledgeStorageService();
    const uploaded = await s3.uploadDocument({
      businessId: scope.businessId,
      title: parsed.data.title,
      content: parsed.data.content,
      contentType: 'text/plain; charset=utf-8',
    });

    const db = getDb();
    const [doc] = await db
      .insert(knowledgeDocuments)
      .values({
        businessId: scope.businessId,
        title: parsed.data.title,
        content: parsed.data.content,
        sourceUrl: parsed.data.sourceUrl,
        s3Bucket: uploaded.bucket,
        s3Key: uploaded.key,
        contentType: uploaded.contentType,
        sizeBytes: uploaded.sizeBytes,
      })
      .returning();

    if (!doc) {
      return res.status(500).json({ ok: false, error: 'Failed to create document' });
    }

    this.embedDocument(doc.id, scope.businessId, parsed.data.content).catch((err) =>
      console.error('[knowledge] embedding failed:', err)
    );

    return res.status(201).json({ ok: true, data: doc });
  };

  public readonly getById = async (req: Request, res: Response) => {
    const id = req.params['id'];
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Document ID is required' });
    }

    const db = getDb();

    if (req.header('authorization')?.startsWith('Bearer ')) {
      const scope = await this.resolveBusinessScope(req, res);
      if (!scope) return;

      const [doc] = await db
        .select()
        .from(knowledgeDocuments)
        .where(and(eq(knowledgeDocuments.id, id), eq(knowledgeDocuments.businessId, scope.businessId)))
        .limit(1);

      if (!doc) {
        return res.status(404).json({ ok: false, error: 'Document not found' });
      }

      let content = doc.content;
      if (doc.s3Key) {
        const s3 = new S3KnowledgeStorageService();
        try {
          content = await s3.getDocumentText(doc.s3Key);
        } catch (error) {
          console.error('[knowledge] failed to load content from s3', error);
        }
      }

      return res.json({ ok: true, data: { ...doc, content } });
    }

    if (!requireApiKey(req, res)) return;

    const [doc] = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id))
      .limit(1);

    if (!doc) {
      return res.status(404).json({ ok: false, error: 'Document not found' });
    }

    return res.json({ ok: true, data: doc });
  };

  public readonly deleteById = async (req: Request, res: Response) => {
    const id = req.params['id'];
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Document ID is required' });
    }

    const db = getDb();

    if (req.header('authorization')?.startsWith('Bearer ')) {
      const scope = await this.resolveBusinessScope(req, res);
      if (!scope) return;

      const [doc] = await db
        .select({ id: knowledgeDocuments.id, s3Key: knowledgeDocuments.s3Key })
        .from(knowledgeDocuments)
        .where(and(eq(knowledgeDocuments.id, id), eq(knowledgeDocuments.businessId, scope.businessId)))
        .limit(1);

      if (!doc) {
        return res.status(404).json({ ok: false, error: 'Document not found' });
      }

      if (doc.s3Key) {
        const s3 = new S3KnowledgeStorageService();
        await s3.deleteDocument(doc.s3Key);
      }

      await db
        .delete(knowledgeDocuments)
        .where(and(eq(knowledgeDocuments.id, id), eq(knowledgeDocuments.businessId, scope.businessId)));

      return res.json({ ok: true, data: { id } });
    }

    if (!requireApiKey(req, res)) return;

    const [doc] = await db
      .select({ id: knowledgeDocuments.id, s3Key: knowledgeDocuments.s3Key })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id))
      .limit(1);

    if (!doc) {
      return res.status(404).json({ ok: false, error: 'Document not found' });
    }

    if (doc.s3Key) {
      const s3 = new S3KnowledgeStorageService();
      await s3.deleteDocument(doc.s3Key);
    }

    await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
    return res.json({ ok: true, data: { id } });
  };

  private async resolveBusinessScope(
    req: Parameters<typeof requireBusinessAuth>[0],
    res: Parameters<typeof requireBusinessAuth>[1],
    requestedBusinessId?: string | null
  ): Promise<{ businessId: string } | null> {
    if (req.header('authorization')?.startsWith('Bearer ')) {
      const auth = await requireBusinessAuth(req, res, 'member');
      if (!auth) return null;

      return { businessId: auth.businessId };
    }

    if (!requireApiKey(req, res)) return null;

    if (!requestedBusinessId) {
      res.status(400).json({ ok: false, error: 'businessId is required' });
      return null;
    }

    return { businessId: requestedBusinessId };
  }

  private async embedDocument(documentId: string, businessId: string, content: string): Promise<void> {
    const chunks = chunkText(content);
    const embeddings = getEmbeddingModel();
    const vectors = await embeddings.embedDocuments(chunks.map((c) => c.content));

    const db = getDb();
    await db.insert(knowledgeChunks).values(
      chunks.map((chunk, i) => ({
        documentId,
        businessId,
        content: chunk.content,
        chunkIndex: chunk.index,
        embedding: vectors[i] ?? [],
      }))
    );
  }
}
