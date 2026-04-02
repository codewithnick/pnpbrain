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
  content: string | Buffer;
  contentType?: string;
  fileName?: string;
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
    const body = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, 'utf8');
    const contentType = input.contentType?.trim() || (Buffer.isBuffer(input.content) ? 'application/octet-stream' : 'text/plain; charset=utf-8');
    const key = this.buildObjectKey(input.businessId, input.title, input.fileName, contentType);

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

  private buildObjectKey(businessId: string, title: string, fileName?: string, contentType?: string): string {
    const safeTitle = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || 'document';

    const extension = resolveStorageExtension(fileName, contentType);

    return `knowledge/${businessId}/${Date.now()}-${safeTitle}${extension ? `.${extension}` : ''}`;
  }
}

function resolveStorageExtension(fileName?: string, contentType?: string): string {
  const fileExtension = fileName ? fileName.split('.').pop()?.toLowerCase() ?? '' : '';
  if (fileExtension && fileExtension.length <= 8) {
    return fileExtension;
  }

  switch (contentType?.split(';')[0]?.trim().toLowerCase()) {
    case 'text/plain':
      return 'txt';
    case 'text/markdown':
      return 'md';
    case 'text/csv':
      return 'csv';
    case 'application/json':
      return 'json';
    case 'application/pdf':
      return 'pdf';
    case 'text/html':
      return 'html';
    case 'application/xml':
    case 'text/xml':
      return 'xml';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'application/msword':
      return 'doc';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx';
    case 'application/vnd.ms-excel':
      return 'xls';
    default:
      return 'bin';
  }
}

function readS3KnowledgeConfig(): S3KnowledgeConfig {
  const bucket = process.env['AWS_S3_KNOWLEDGE_BUCKET'] ?? process.env['AWS_S3_BUCKET_NAME'];
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
