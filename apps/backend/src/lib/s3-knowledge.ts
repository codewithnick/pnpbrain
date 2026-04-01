import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

interface S3KnowledgeConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface UploadKnowledgeInput {
  businessId: string;
  title: string;
  content: string;
  contentType?: string;
}

export interface UploadKnowledgeResult {
  key: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
}

export class S3KnowledgeStorageService {
  private readonly client: S3Client;
  private readonly config: S3KnowledgeConfig;

  constructor(config = readS3KnowledgeConfig()) {
    this.config = config;
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  public async uploadDocument(input: UploadKnowledgeInput): Promise<UploadKnowledgeResult> {
    const contentType = input.contentType?.trim() || 'text/plain; charset=utf-8';
    const key = this.buildObjectKey(input.businessId, input.title);
    const body = Buffer.from(input.content, 'utf8');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    return {
      key,
      bucket: this.config.bucket,
      contentType,
      sizeBytes: body.byteLength,
    };
  }

  public async getDocumentText(key: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error('S3 object has no body');
    }

    return response.Body.transformToString();
  }

  public async deleteDocument(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    );
  }

  private buildObjectKey(businessId: string, title: string): string {
    const safeTitle = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || 'document';

    return `knowledge/${businessId}/${Date.now()}-${safeTitle}.txt`;
  }
}

function readS3KnowledgeConfig(): S3KnowledgeConfig {
  const bucket = process.env['AWS_S3_KNOWLEDGE_BUCKET'];
  const region = process.env['AWS_REGION'];
  const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing S3 config. Required: AWS_S3_KNOWLEDGE_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY'
    );
  }

  return { bucket, region, accessKeyId, secretAccessKey };
}
