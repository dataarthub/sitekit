import type {
  ContentBodyDocument,
  ContentBodyFormat,
  ContentBodyValue,
} from '../contracts/content.js';

/**
 * Fallback provenance used when a rich-body document has no recognized source value.
 */
export interface ContentBodyParseOptions {
  /** Fallback provenance for missing or unrecognized source values. */
  defaultSource?: ContentBodyDocument['source'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFormat(value: unknown): value is ContentBodyFormat {
  return value === 'markdown' || value === 'html' || value === 'blocks' || value === 'json';
}

function isBodyValue(format: ContentBodyFormat, value: unknown): value is ContentBodyValue {
  if (format === 'markdown' || format === 'html') return typeof value === 'string';
  if (format === 'blocks') return Array.isArray(value) && value.every(isRecord);
  return isRecord(value) || (Array.isArray(value) && value.every(isRecord));
}

/**
 * Checks the format and top-level value shape of a rich content document.
 *
 * @param value - Untrusted document-like value.
 * @param options - Fallback provenance when the supplied source is absent or unrecognized.
 * @returns A normalized document retaining its body value, or null when its format/value shape is invalid.
 * @remarks Validation checks container shapes only; it neither validates editor-specific nodes nor sanitizes HTML.
 * @example
 * ```ts
 * import { parseContentBodyDocument } from '@alneas/sitekit/content';
 * const body = parseContentBodyDocument({ format: 'markdown', value: '# Welcome' }, { defaultSource: 'cms' });
 * ```
 */
export function parseContentBodyDocument(
  value: unknown,
  options: ContentBodyParseOptions = {},
): ContentBodyDocument | null {
  if (!isRecord(value)) return null;
  const format = value.format;
  if (!isFormat(format) || !isBodyValue(format, value.value)) return null;

  const version = typeof value.version === 'string' ? value.version : undefined;
  const source = typeof value.source === 'string' &&
    ['cms', 'blocknote', 'markdown', 'generated', 'external'].includes(value.source)
    ? value.source as ContentBodyDocument['source']
    : options.defaultSource;

  return {
    format,
    value: value.value,
    ...(version !== undefined ? { version } : {}),
    ...(source !== undefined ? { source } : {}),
  };
}

/**
 * Returns string bodies unchanged or collects nested text fields from structured bodies.
 *
 * @param document - A content body document whose value is a string, object, or array of objects.
 * @returns The original string, or recursively collected text fields joined with normalized whitespace.
 * @remarks Markdown syntax and HTML markup remain in string bodies. Structured values should be acyclic; this is not an HTML sanitizer or renderer.
 * @example
 * ```ts
 * import { contentBodyToText } from '@alneas/sitekit/content';
 * const text = contentBodyToText({ format: 'blocks', value: [{ text: 'Welcome' }] });
 * ```
 */
export function contentBodyToText(document: ContentBodyDocument): string {
  if (typeof document.value === 'string') return document.value;
  const textParts: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.text === 'string') textParts.push(value.text);
    Object.entries(value).forEach(([key, child]) => {
      if (key !== 'text') visit(child);
    });
  };
  visit(document.value);
  return textParts.join(' ').replace(/\s+/g, ' ').trim();
}
