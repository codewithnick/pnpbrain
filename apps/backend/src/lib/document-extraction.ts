import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';

export interface ExtractDocumentInput {
  buffer: Buffer;
  fileName?: string;
  contentType?: string | null;
}

export interface ExtractDocumentResult {
  text: string;
  contentType: string;
}

const TEXT_CONTENT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
  'application/xml',
  'text/xml',
]);

const WORD_CONTENT_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const SPREADSHEET_CONTENT_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

const PDF_CONTENT_TYPES = new Set(['application/pdf']);
const HTML_CONTENT_TYPES = new Set(['text/html']);
const MARKUP_CONTENT_TYPES = new Set(['application/xml', 'text/xml']);

export class DocumentExtractionService {
  public async extractText(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
    const normalizedContentType = normalizeContentType(input.contentType);
    const detectedType = await detectContentType(input.buffer, input.fileName, normalizedContentType);
    const text = await this.extractByType(input.buffer, detectedType, input.fileName);

    if (text.trim()) {
      return {
        text: text.trim(),
        contentType: normalizedContentType ?? detectedType ?? 'application/octet-stream',
      };
    }

    return {
      text: buildFallbackText(input.fileName, normalizedContentType ?? detectedType),
      contentType: normalizedContentType ?? detectedType ?? 'application/octet-stream',
    };
  }

  private async extractByType(buffer: Buffer, contentType: string | null, fileName?: string): Promise<string> {
    if (isTextContentType(contentType) || looksLikeTextFile(fileName)) {
      return decodeUtf8(buffer, contentType);
    }

    if (isPdfContentType(contentType) || hasExtension(fileName, '.pdf')) {
      return extractPdfText(buffer);
    }

    if (isWordContentType(contentType) || hasExtension(fileName, '.docx') || hasExtension(fileName, '.doc')) {
      return extractWordText(buffer);
    }

    if (isSpreadsheetContentType(contentType) || hasExtension(fileName, '.xlsx') || hasExtension(fileName, '.xls')) {
      return extractSpreadsheetText(buffer, fileName);
    }

    if (isHtmlContentType(contentType) || hasExtension(fileName, '.html') || hasExtension(fileName, '.htm')) {
      return stripMarkup(buffer.toString('utf8'));
    }

    if (isMarkupContentType(contentType) || hasExtension(fileName, '.xml')) {
      return stripMarkup(buffer.toString('utf8'));
    }

    const utf8Text = decodeUtf8(buffer, contentType);
    if (looksLikeReadableText(utf8Text)) {
      return utf8Text;
    }

    return '';
  }
}

function normalizeContentType(contentType?: string | null): string | null {
  if (!contentType) return null;
  return contentType.split(';')[0]?.trim().toLowerCase() || null;
}

async function detectContentType(
  buffer: Buffer,
  fileName?: string,
  contentType?: string | null,
): Promise<string | null> {
  if (contentType) return contentType;

  const detected = await fileTypeFromBuffer(buffer);
  if (detected?.mime) {
    return detected.mime.toLowerCase();
  }

  const ext = path.extname(fileName ?? '').toLowerCase();
  return extensionToContentType(ext);
}

function isTextContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return TEXT_CONTENT_TYPES.has(contentType) || contentType.startsWith('text/');
}

function isWordContentType(contentType: string | null): boolean {
  return contentType ? WORD_CONTENT_TYPES.has(contentType) : false;
}

function isSpreadsheetContentType(contentType: string | null): boolean {
  return contentType ? SPREADSHEET_CONTENT_TYPES.has(contentType) : false;
}

function isPdfContentType(contentType: string | null): boolean {
  return contentType ? PDF_CONTENT_TYPES.has(contentType) : false;
}

function isHtmlContentType(contentType: string | null): boolean {
  return contentType ? HTML_CONTENT_TYPES.has(contentType) : false;
}

function isMarkupContentType(contentType: string | null): boolean {
  return contentType ? MARKUP_CONTENT_TYPES.has(contentType) : false;
}

function hasExtension(fileName: string | undefined, extension: string): boolean {
  return path.extname(fileName ?? '').toLowerCase() === extension;
}

function looksLikeTextFile(fileName: string | undefined): boolean {
  const extension = path.extname(fileName ?? '').toLowerCase();
  return ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.yaml', '.yml'].includes(extension);
}

function decodeUtf8(buffer: Buffer, contentType?: string | null): string {
  const text = buffer.toString('utf8');

  if (contentType === 'application/json') {
    try {
      return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
    } catch {
      return text;
    }
  }

  return text;
}

function looksLikeReadableText(text: string): boolean {
  if (!text.trim()) return false;

  const sample = text.slice(0, 2000);
  if (sample.includes('\u0000')) return false;

  const printableCount = (sample.match(/[\t\n\r\x20-\x7E\u00A0-\uFFFF]/g) ?? []).length;
  return printableCount / Math.max(sample.length, 1) > 0.75;
}

function buildFallbackText(fileName: string | undefined, contentType: string | null): string {
  const name = fileName?.trim() || 'uploaded document';
  const typeLabel = contentType ?? 'unknown type';

  return [
    `Uploaded file: ${name}`,
    `Detected type: ${typeLabel}`,
    '',
    'The file was accepted, but automatic text extraction was not available for this format.',
    'If you need AI to reason over the file contents, add an extractor or OCR step for this document type.',
  ].join('\n');
}

function stripMarkup(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const module = (await import('pdf-parse')) as unknown as {
    default?: (input: Buffer) => Promise<{ text: string }>;
  } & ((input: Buffer) => Promise<{ text: string }>);
  const pdfParse = module.default ?? module;
  const result = await pdfParse(buffer);
  return result.text ?? '';
}

async function extractWordText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? '';
}

async function extractSpreadsheetText(buffer: Buffer, fileName?: string): Promise<string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return '';
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false }) as unknown[][];
    const renderedRows = rows
      .map((row) => row.map((cell) => String(cell ?? '')).join('\t').trimEnd())
      .filter((row) => row.trim().length > 0)
      .join('\n');

    return renderedRows ? `[Sheet: ${sheetName}]\n${renderedRows}` : '';
  });

  const text = sheets.filter((sheet) => sheet.trim().length > 0).join('\n\n');
  if (text.trim()) return text;

  return fileName ? `Spreadsheet uploaded: ${fileName}` : '';
}

function extensionToContentType(extension: string): string | null {
  switch (extension) {
    case '.txt':
      return 'text/plain';
    case '.md':
      return 'text/markdown';
    case '.csv':
      return 'text/csv';
    case '.json':
      return 'application/json';
    case '.xml':
      return 'application/xml';
    case '.html':
    case '.htm':
      return 'text/html';
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.doc':
      return 'application/msword';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls':
      return 'application/vnd.ms-excel';
    default:
      return null;
  }
}