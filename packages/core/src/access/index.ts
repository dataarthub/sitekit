import type { ContentItem, ContentVisibility } from '../contracts/content.js';

/** Delivery state used to include or withhold protected body fields. */
export type ContentAccessMode = 'full' | 'preview' | 'denied';
/** Suggested HTTP cache scope for an access decision; the host must apply it. */
export type ContentCachePolicy = 'public' | 'private' | 'no-store';

/** Caller identity, entitlement keys, and resolver-specific metadata. */
export interface ContentAccessContext {
  /**
   * Host identity of the caller or purchasing subject.
   */
  subjectId?: string;
  /**
   * Entitlement keys available to the caller when no custom resolver is configured.
   */
  entitlements?: readonly string[];
  /**
   * Resolver-specific caller metadata; the built-in entitlement-array lookup does not inspect it.
   */
  metadata?: Readonly<Record<string, unknown>>;
}

/** Provider boundary for deciding whether a caller may read restricted content. */
export interface ContentEntitlementResolver {
  /**
   * Evaluates a caller entitlement for one content record.
   *
   * @param content - Restricted content to evaluate.
   * @param context - Caller identity and resolver-specific context.
   * @returns Whether the caller has the required entitlement.
   *
   * @example
   * ```ts
   * import type { ContentEntitlementResolver } from '@alneas/sitekit/access';
   * export function useHasEntitlement(host: ContentEntitlementResolver, ...args: Parameters<NonNullable<ContentEntitlementResolver['hasEntitlement']>>) {
   * return host.hasEntitlement(...args);
   * }
   * ```
   */
  hasEntitlement(
    content: ContentItem,
    context: ContentAccessContext,
  ): boolean | Promise<boolean>;
}

/** Resolved delivery mode and cache guidance for one content item. */
export interface ContentAccessDecision {
  /**
   * Resolved content delivery mode.
   */
  mode: ContentAccessMode;
  /**
   * Whether public visibility or entitlement allows complete content access.
   */
  entitled: boolean;
  /**
   * Reason explaining publication, visibility or entitlement handling.
   */
  reason:
    | 'public'
    | 'entitled'
    | 'preview'
    | 'requires-entitlement'
    | 'private'
    | 'not-published';
  /** Suggested cache scope; callers must enforce it in delivery responses. */
  cache: ContentCachePolicy;
  /**
   * Resolved access key, omitted for unrestricted public content.
   */
  entitlementKey?: string;
}

/** Controls restricted-content entitlement lookup and preview fallback. */
export interface ContentAccessOptions {
  /** Overrides context entitlement-array lookup for restricted content. */
  resolver?: ContentEntitlementResolver;
  /** Defaults to true for members and paid content lacking an entitlement. */
  allowPreview?: boolean;
}

function isPublished(status: ContentItem['status']): boolean {
  return status === undefined || status === 'published';
}

function entitlementKey(content: ContentItem): string {
  return content.access?.entitlementKey ?? content.id;
}

function isEntitledFromContext(
  content: ContentItem,
  context: ContentAccessContext,
): boolean {
  const key = entitlementKey(content);
  return context.entitlements?.includes(key) ?? false;
}

/**
 * Resolves publication, visibility, and entitlement into a delivery and cache decision.
 *
 * @param content - Canonical content whose missing status is treated as published.
 * @param context - Identity and entitlement keys; defaults to an anonymous context.
 * @param options - Optional resolver and preview policy; previews are allowed by default.
 * @returns The access mode, reason, entitlement state, and suggested cache policy.
 * @throws Propagates errors from the entitlement resolver.
 * @remarks Private and unpublished content is denied before consulting the resolver.
 * @example
 * ```ts
 * import { resolveContentAccess } from '@alneas/sitekit/access';
 * const content = { id: 'guide', collection: 'guides', slug: 'guide', locale: 'en', title: 'Guide', tags: [], data: {} };
 * const decision = await resolveContentAccess(content);
 * ```
 */
export async function resolveContentAccess(
  content: ContentItem,
  context: ContentAccessContext = {},
  options: ContentAccessOptions = {},
): Promise<ContentAccessDecision> {
  const key = entitlementKey(content);

  if (!isPublished(content.status)) {
    return {
      mode: 'denied',
      entitled: false,
      reason: 'not-published',
      cache: 'no-store',
      entitlementKey: key,
    };
  }

  const visibility: ContentVisibility = content.access?.visibility ?? 'public';
  if (visibility === 'public') {
    return { mode: 'full', entitled: true, reason: 'public', cache: 'public' };
  }

  if (visibility === 'private') {
    return {
      mode: 'denied',
      entitled: false,
      reason: 'private',
      cache: 'no-store',
      entitlementKey: key,
    };
  }

  const entitled = options.resolver
    ? await options.resolver.hasEntitlement(content, context)
    : isEntitledFromContext(content, context);

  if (entitled) {
    return {
      mode: 'full',
      entitled: true,
      reason: 'entitled',
      cache: 'private',
      entitlementKey: key,
    };
  }

  if (options.allowPreview !== false) {
    return {
      mode: 'preview',
      entitled: false,
      reason: 'preview',
      cache: 'public',
      entitlementKey: key,
    };
  }

  return {
    mode: 'denied',
    entitled: false,
    reason: 'requires-entitlement',
    cache: 'public',
    entitlementKey: key,
  };
}

/**
 * Removes protected body fields for preview and denied access.
 *
 * @param content - Canonical content to project.
 * @param decision - Previously resolved access decision.
 * @returns The original object for full access, or a shallow copy without body and bodyDocument.
 * @remarks Other fields, including data and summary, remain present; callers must keep protected payloads out of those fields.
 * @example
 * ```ts
 * import { projectContentForAccess } from '@alneas/sitekit/access';
 * const content = { id: 'guide', collection: 'guides', slug: 'guide', locale: 'en', title: 'Guide', tags: [], data: {} };
 * const preview = projectContentForAccess(content, { mode: 'preview', entitled: false, reason: 'preview', cache: 'public' });
 * ```
 */
export function projectContentForAccess(
  content: ContentItem,
  decision: ContentAccessDecision,
): ContentItem {
  if (decision.mode === 'full') return content;
  const { body: _body, bodyDocument: _bodyDocument, ...withoutBody } = content;
  return withoutBody;
}

/** Markdown portions around the first standalone paywall marker. */
export interface PaywallSplit {
  /**
   * Whether a standalone paywall marker was found.
   */
  hasPaywall: boolean;
  /**
   * Markdown before the first marker, or the original Markdown when no marker exists.
   */
  freeContent: string;
  /**
   * Markdown after the first marker, or null when no marker exists.
   */
  paidContent: string | null;
}

/**
 * Splits Markdown at a standalone `---paywall---` line.
 *
 * @param rawMarkdown - Markdown that may contain editorial paywall markers.
 * @returns The free portion and nullable paid portion, with a flag indicating marker presence.
 * @remarks When a marker exists, leading frontmatter is removed and both portions are trimmed; later markers remain in the paid portion.
 * @example
 * ```ts
 * import { splitPaywall } from '@alneas/sitekit/access';
 * const split = splitPaywall('Introduction\n---paywall---\nFull article');
 * ```
 */
export function splitPaywall(rawMarkdown: string): PaywallSplit {
  const parts = rawMarkdown.split(/^---paywall---$/m);
  if (parts.length === 1) {
    return { hasPaywall: false, freeContent: rawMarkdown, paidContent: null };
  }

  const removeFrontmatter = (markdown: string) => markdown.replace(/^---[\s\S]*?---\s*/, '').trim();
  return {
    hasPaywall: true,
    freeContent: removeFrontmatter(parts[0] ?? ''),
    paidContent: removeFrontmatter(parts.slice(1).join('\n---paywall---\n')),
  };
}

/**
 * Selects the first Markdown paragraphs without rendering or sanitizing them.
 *
 * @param markdown - Markdown split on blank lines.
 * @param options - Paragraph count (default 2) and appended suffix (default empty).
 * @returns The selected paragraphs and suffix, or an empty string for empty input.
 * @example
 * ```ts
 * import { createMarkdownPreview } from '@alneas/sitekit/access';
 * const preview = createMarkdownPreview('Intro\n\nDetails', { paragraphs: 1 });
 * ```
 */
export function createMarkdownPreview(
  markdown: string,
  options: {
  /**
              * Number of initial Markdown paragraphs selected; defaults to 2.
              */
             paragraphs?: number;
  /**
                                   * Text appended to the selected Markdown preview; defaults to an empty string.
                                   */
                                  suffix?: string } = {},
): string {
  if (!markdown) return '';
  const paragraphs = markdown.split(/\n\s*\n/).slice(0, options.paragraphs ?? 2);
  return `${paragraphs.join('\n\n')}${options.suffix ?? ''}`;
}

/**
 * Selects HTML blocks until a block or text-length threshold is reached.
 *
 * @param html - HTML source to preview.
 * @param options - Maximum blocks (default 4) and text characters (default 300).
 * @returns Matched blocks, or a paragraph containing truncated tag-stripped fallback text.
 * @remarks Thresholds are checked after adding a whole block. This regex-based helper does not sanitize HTML or guarantee a strict character bound.
 * @example
 * ```ts
 * import { createHtmlPreview } from '@alneas/sitekit/access';
 * const preview = createHtmlPreview('<p>Intro</p><p>Details</p>', { maxBlocks: 1 });
 * ```
 */
export function createHtmlPreview(html: string, options: {
  /**
                                                            * Whole-block preview threshold; defaults to 4.
                                                            */
                                                           maxBlocks?: number;
  /**
                                                                                * Text-character preview threshold; defaults to 300 and may be exceeded by a whole block.
                                                                                */
                                                                               maxCharacters?: number } = {}): string {
  if (!html) return '';
  const blockRegex = /(<(?:p|h[1-6]|blockquote|ul|ol|pre|div|section|table)[\s\S]*?<\/(?:p|h[1-6]|blockquote|ul|ol|pre|div|section|table)>)/gi;
  const blocks = html.match(blockRegex);
  if (!blocks || blocks.length === 0) {
    const cleanText = html.replace(/<[^>]+>/g, '').slice(0, options.maxCharacters ?? 300);
    return cleanText ? `<p>${cleanText}...</p>` : '';
  }

  const preview: string[] = [];
  let characters = 0;
  for (const block of blocks) {
    preview.push(block);
    characters += block.replace(/<[^>]+>/g, '').length;
    if (preview.length >= (options.maxBlocks ?? 4) || characters >= (options.maxCharacters ?? 300)) break;
  }
  return preview.join('\n');
}
