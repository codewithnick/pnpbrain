import { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@gcfis/db/client';
import { knowledgeChunks, knowledgeDocuments } from '@gcfis/db/schema';
import { chunkText, getEmbeddingModel, normalizeEmbeddingVector } from '@gcfis/agent/rag';
import { DocumentExtractionService } from '../lib/document-extraction';
import { S3KnowledgeStorageService } from '../lib/s3-knowledge';
import { resolveAgentForBusiness } from '../lib/agents';
import { requireApiKey, requireBusinessAuth } from '../middleware/auth';

const createDocSchema = z.object({
  businessId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});

export class KnowledgeController {
  public readonly upload = multer({ storage: multer.memoryStorage() });
  private readonly documentExtractionService = new DocumentExtractionService();

  private readRequestedScope(req: Request): { businessId: string | null; agentId: string | null } {
    const bodyBusinessId = String(req.body?.['businessId'] ?? '').trim();
    const queryBusinessId = String(req.query['businessId'] ?? '').trim();
    const headerBusinessId = String(req.header('x-business-id') ?? '').trim();

    const bodyAgentId = String(req.body?.['agentId'] ?? '').trim();
    const queryAgentId = String(req.query['agentId'] ?? '').trim();
    const headerAgentId = String(req.header('x-agent-id') ?? '').trim();

    return {
      businessId: bodyBusinessId || queryBusinessId || headerBusinessId || null,
      agentId: bodyAgentId || queryAgentId || headerAgentId || null,
    };
  }

  public readonly list = async (req: Request, res: Response) => {
    const scope = await this.resolveBusinessScope(
      req,
      res,
      String(req.query['businessId'] ?? '') || null,
      String(req.query['agentId'] ?? '') || null,
    );
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
      .where(
        scope.agentId
          ? and(
              eq(knowledgeDocuments.businessId, scope.businessId),
              eq(knowledgeDocuments.agentId, scope.agentId)
            )
          : eq(knowledgeDocuments.businessId, scope.businessId)
      )
      .orderBy(knowledgeDocuments.createdAt);

    return res.json({ ok: true, data: docs });
  };

  public readonly create = async (req: Request, res: Response) => {
    const requestedScope = this.readRequestedScope(req);
    const hasMultipart = (req.header('content-type') ?? '').includes('multipart/form-data');
    if (hasMultipart) {
      const title = String(req.body['title'] ?? '').trim();
      const sourceUrl = String(req.body['sourceUrl'] ?? '').trim() || undefined;

      if (!title) {
        return res.status(400).json({ ok: false, error: 'title is required' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: 'file is required' });
      }

      const scope = await this.resolveBusinessScope(req, res, requestedScope.businessId, requestedScope.agentId);
      if (!scope) return;

      const extracted = await this.documentExtractionService.extractText({
        buffer: file.buffer,
        fileName: file.originalname,
        contentType: file.mimetype,
      });

      if (!extracted.text.trim()) {
        return res.status(400).json({ ok: false, error: 'Uploaded file could not be converted into searchable text.' });
      }

      const contentType = file.mimetype || extracted.contentType || 'application/octet-stream';
      const uploaded = await this.tryUploadKnowledgeFile({
        businessId: scope.businessId,
        title,
        content: file.buffer,
        contentType,
        fileName: file.originalname,
      });

      const db = getDb();
      const [doc] = await db
        .insert(knowledgeDocuments)
        .values({
          businessId: scope.businessId,
          agentId: scope.agentId,
          title,
          content: extracted.text,
          sourceUrl,
          s3Bucket: uploaded?.bucket ?? null,
          s3Key: uploaded?.key ?? null,
          contentType: uploaded?.contentType ?? contentType,
          sizeBytes: uploaded?.sizeBytes ?? file.size,
        })
        .returning();

      if (!doc) {
        return res.status(500).json({ ok: false, error: 'Failed to create document' });
      }

      this.embedDocument(doc.id, scope.businessId, scope.agentId, extracted.text).catch((err) =>
        console.error('[knowledge] embedding failed:', err)
      );

      return res.status(201).json({ ok: true, data: doc });
    }

    const parsed = createDocSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    const scope = await this.resolveBusinessScope(
      req,
      res,
      parsed.data.businessId ?? requestedScope.businessId,
      parsed.data.agentId ?? requestedScope.agentId,
    );
    if (!scope) return;

    const uploaded = await this.tryUploadKnowledgeFile({
      businessId: scope.businessId,
      title: parsed.data.title,
      content: parsed.data.content,
      contentType: 'text/plain; charset=utf-8',
      fileName: `${parsed.data.title}.txt`,
    });

    const db = getDb();
    const [doc] = await db
      .insert(knowledgeDocuments)
      .values({
        businessId: scope.businessId,
        agentId: scope.agentId,
        title: parsed.data.title,
        content: parsed.data.content,
        sourceUrl: parsed.data.sourceUrl,
        s3Bucket: uploaded?.bucket ?? null,
        s3Key: uploaded?.key ?? null,
        contentType: uploaded?.contentType ?? 'text/plain; charset=utf-8',
        sizeBytes: uploaded?.sizeBytes ?? Buffer.byteLength(parsed.data.content, 'utf8'),
      })
      .returning();

    if (!doc) {
      return res.status(500).json({ ok: false, error: 'Failed to create document' });
    }

    this.embedDocument(doc.id, scope.businessId, scope.agentId, parsed.data.content).catch((err) =>
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
      if (doc.s3Key && isTextLikeContentType(doc.contentType)) {
        const s3 = this.createSafeS3KnowledgeStorageService();
        if (s3) {
          try {
            content = await s3.getDocumentText(doc.s3Key);
          } catch (error) {
            console.error('[knowledge] failed to load content from s3', error);
          }
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
        const s3 = this.createSafeS3KnowledgeStorageService();
        if (s3) {
          try {
            await s3.deleteDocument(doc.s3Key);
          } catch (error) {
            console.error('[knowledge] failed to delete document from s3', error);
          }
        }
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
      const s3 = this.createSafeS3KnowledgeStorageService();
      if (s3) {
        try {
          await s3.deleteDocument(doc.s3Key);
        } catch (error) {
          console.error('[knowledge] failed to delete document from s3', error);
        }
      }
    }

    await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
    return res.json({ ok: true, data: { id } });
  };

  private async resolveBusinessScope(
    req: Parameters<typeof requireBusinessAuth>[0],
    res: Parameters<typeof requireBusinessAuth>[1],
    requestedBusinessId?: string | null,
    requestedAgentId?: string | null,
  ): Promise<{ businessId: string; agentId?: string } | null> {
    if (req.header('authorization')?.startsWith('Bearer ')) {
      const auth = await requireBusinessAuth(req, res, 'member');
      if (!auth) return null;

      if (requestedAgentId) {
        const agent = await resolveAgentForBusiness(auth.businessId, requestedAgentId);
        if (!agent || agent.id !== requestedAgentId) {
          res.status(404).json({ ok: false, error: 'Agent not found' });
          return null;
        }

        return { businessId: auth.businessId, agentId: agent.id };
      }

      return { businessId: auth.businessId };
    }

    if (!requireApiKey(req, res)) return null;

    if (!requestedBusinessId) {
      res.status(400).json({ ok: false, error: 'businessId is required' });
      return null;
    }

    return {
      businessId: requestedBusinessId,
      ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
    };
  }

  private async embedDocument(
    documentId: string,
    businessId: string,
    agentId: string | undefined,
    content: string,
  ): Promise<void> {
    const chunks = chunkText(content);
    const embeddings = getEmbeddingModel();
    const vectors = await embeddings.embedDocuments(chunks.map((c) => c.content));

    const db = getDb();
    await db.insert(knowledgeChunks).values(
      chunks.map((chunk, i) => ({
        documentId,
        businessId,
        agentId,
        content: chunk.content,
        chunkIndex: chunk.index,
        embedding: normalizeEmbeddingVector(vectors[i] ?? []),
      }))
    );
  }

  private createSafeS3KnowledgeStorageService(): S3KnowledgeStorageService | null {
    try {
      return new S3KnowledgeStorageService();
    } catch (error) {
      console.error('[knowledge] S3 storage is unavailable; continuing without file archive support', error);
      return null;
    }
  }

  private async tryUploadKnowledgeFile(input: {
    businessId: string;
    title: string;
    content: string | Buffer;
    contentType: string;
    fileName?: string;
  }): Promise<{ key: string; bucket: string; contentType: string; sizeBytes: number } | null> {
    const s3 = this.createSafeS3KnowledgeStorageService();
    if (!s3) {
      return null;
    }

    try {
      return await s3.uploadDocument(input);
    } catch (error) {
      console.error('[knowledge] failed to upload document to s3', error);
      return null;
    }
  }
}

function isTextLikeContentType(contentType?: string | null): boolean {
  if (!contentType) return false;

  const normalized = contentType.split(';')[0]?.trim().toLowerCase();
  if (!normalized) return false;

  return normalized.startsWith('text/') || new Set([
    'application/json',
    'application/xml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ]).has(normalized);
}
