import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1';

function getEncryptionKey(): Buffer {
  const secret = process.env['DATA_ENCRYPTION_KEY']
    ?? process.env['SUPABASE_SERVICE_ROLE_KEY']
    ?? process.env['PUBLIC_CHAT_TOKEN_SECRET'];

  if (!secret) {
    throw new Error('DATA_ENCRYPTION_KEY (or fallback secret) must be configured');
  }

  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith(`${PREFIX}:`)) return value;

  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(`${PREFIX}:`)) return value;

  const [, ivB64, tagB64, payloadB64] = value.split(':');
  if (!ivB64 || !tagB64 || !payloadB64) return null;

  const key = getEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadB64, 'base64url')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
