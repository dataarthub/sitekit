import type { ZodType } from 'zod';

/**
 * Schema and optional normalization for a named embedded extension.
 * @typeParam K - String discriminator used to identify the plugin in its registry. Must satisfy string.
 * @typeParam D - Validated payload passed from the schema to the renderer or normalizer.
 */
export interface SectionExtensionPlugin<K extends string, D> {
  /**
   * Registry key for this embedded extension schema.
   */
  type: K;
  /**
   * Validates the complete extension value, including its discriminator, before optional normalization.
   */
  schema: ZodType<D>;
  /**
   * Runs after successful schema parsing; exceptions propagate from safeParse too.
   * @param data - Payload associated with this record.
   * @returns Normalized extension data returned by parse and successful safeParse.
   * @example
   * ```ts
   * import type { SectionExtensionPlugin } from '@alneas/sitekit/sections';
   * export function useNormalize(host: SectionExtensionPlugin<string, unknown>, ...args: Parameters<NonNullable<SectionExtensionPlugin<string, unknown>['normalize']>>) {
   * return host.normalize?.(...args);
   * }
   * ```
   */
  normalize?: (data: D) => D;
}

type RegisteredSectionExtension = {
  type: string;
  schema: ZodType<unknown>;
  normalize?: (data: unknown) => unknown;
};

/** Successful extension result, including unchanged unknown values. */
export interface SectionExtensionParseSuccess {
  /**
   * Discriminator indicating whether schema validation succeeded.
   */
  success: true;
  /**
   * Payload associated with this record.
   */
  data: unknown;
}

/** Schema validation failure for a registered extension type. */
export interface SectionExtensionParseFailure {
  /**
   * Discriminator indicating whether schema validation succeeded.
   */
  success: false;
  /**
   * Error details describing an unsuccessful outcome.
   */
  error: unknown;
}

/** Discriminated outcome of registered-extension validation. */
export type SectionExtensionParseResult =
  | SectionExtensionParseSuccess
  | SectionExtensionParseFailure;

/**
 * Registry for typed data extensions embedded inside a section.
 *
 * Unknown extensions are intentionally left untouched so a consumer can
 * migrate incrementally without making the host framework aware of every
 * domain-specific section shape.
 *
 * @example
 * ```ts
 * import { SectionExtensionRegistry } from '@alneas/sitekit/sections';
 * const registry = new SectionExtensionRegistry();
 * const value = registry.parse({ type: 'unregistered' });
 * ```
 */
export class SectionExtensionRegistry {
  private readonly plugins = new Map<string, RegisteredSectionExtension>();

  /**
   * Registers a schema and optional normalizer for an embedded extension.
   *
   * @param plugin - Extension definition keyed by type.
   * @returns This registry for chaining.
   * @throws If the extension type is already registered.
   *
   * @example
   * ```ts
   * import type { SectionExtensionRegistry } from '@alneas/sitekit/sections';
   * export function useRegister(host: SectionExtensionRegistry, ...args: Parameters<NonNullable<SectionExtensionRegistry['register']>>) {
   * return host.register(...args);
   * }
   * ```
   * @typeParam K - String discriminator used to identify the plugin in its registry. Must satisfy string.
   * @typeParam D - Validated payload passed from the schema to the renderer or normalizer.
   */
  register<K extends string, D>(plugin: SectionExtensionPlugin<K, D>): this {
    if (this.plugins.has(plugin.type)) {
      throw new Error(`Section extension already registered: ${plugin.type}`);
    }
    this.plugins.set(plugin.type, plugin as unknown as RegisteredSectionExtension);
    return this;
  }

  /**
   * Looks up an embedded extension definition.
   *
   * @param type - Registered extension name.
   * @returns The plugin, or undefined.
   *
   * @example
   * ```ts
   * import type { SectionExtensionRegistry } from '@alneas/sitekit/sections';
   * export function useGet(host: SectionExtensionRegistry, ...args: Parameters<NonNullable<SectionExtensionRegistry['get']>>) {
   * return host.get(...args);
   * }
   * ```
   */
  get(type: string): SectionExtensionPlugin<string, unknown> | undefined {
    return this.plugins.get(type) as SectionExtensionPlugin<string, unknown> | undefined;
  }

  /**
   * Checks whether an extension name is registered.
   *
   * @param type - Extension name to inspect.
   * @returns Whether the registry contains that name.
   *
   * @example
   * ```ts
   * import type { SectionExtensionRegistry } from '@alneas/sitekit/sections';
   * export function useHas(host: SectionExtensionRegistry, ...args: Parameters<NonNullable<SectionExtensionRegistry['has']>>) {
   * return host.has(...args);
   * }
   * ```
   */
  has(type: string): boolean {
    return this.plugins.has(type);
  }

  /**
   * Lists registered extension names.
   *
   * @returns A new lexically sorted array.
   *
   * @example
   * ```ts
   * import type { SectionExtensionRegistry } from '@alneas/sitekit/sections';
   * export function useTypes(host: SectionExtensionRegistry, ...args: Parameters<NonNullable<SectionExtensionRegistry['types']>>) {
   * return host.types(...args);
   * }
   * ```
   */
  types(): string[] {
    return [...this.plugins.keys()].sort();
  }

  /**
   * Validates and optionally normalizes a known extension; preserves unknown values.
   *
   * @param value - Value with an optional string type discriminator.
   * @returns Parsed and normalized data, or the original value for unknown types.
   * @throws On schema failure or a normalizer exception.
   *
   * @example
   * ```ts
   * import type { SectionExtensionRegistry } from '@alneas/sitekit/sections';
   * export function useParse(host: SectionExtensionRegistry, ...args: Parameters<NonNullable<SectionExtensionRegistry['parse']>>) {
   * return host.parse(...args);
   * }
   * ```
   */
  parse(value: unknown): unknown {
    const result = this.safeParse(value);
    if (!result.success) throw result.error;
    return result.data;
  }

  /**
   * Returns schema validation outcomes while preserving unregistered extension values.
   *
   * @param value - Value to inspect for a registered type discriminator.
   * @returns A success with parsed data, or a failure containing the schema error.
   * @throws Propagates normalizer exceptions; these are not converted to failure results.
   * @remarks Parsing is shallow and does not recursively validate nested extension values.
   *
   * @example
   * ```ts
   * import type { SectionExtensionRegistry } from '@alneas/sitekit/sections';
   * export function useSafeParse(host: SectionExtensionRegistry, ...args: Parameters<NonNullable<SectionExtensionRegistry['safeParse']>>) {
   * return host.safeParse(...args);
   * }
   * ```
   */
  safeParse(value: unknown): SectionExtensionParseResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { success: true, data: value };
    }

    const type = (value as { type?: unknown }).type;
    if (typeof type !== 'string') return { success: true, data: value };

    const plugin = this.plugins.get(type);
    if (!plugin) return { success: true, data: value };

    const parsed = plugin.schema.safeParse(value);
    if (!parsed.success) return { success: false, error: parsed.error };
    return {
      success: true,
      data: plugin.normalize ? plugin.normalize(parsed.data) : parsed.data,
    };
  }
}

/**
 * Creates a registry and registers the supplied typed extension plugins.
 *
 * @param plugins - Initial extension definitions; defaults to an empty registry.
 * @returns A registry that validates known types and preserves unknown values.
 * @throws If initial plugins contain duplicate type names.
 * @example
 * ```ts
 * import { createSectionExtensionRegistry } from '@alneas/sitekit/sections';
 * const extensions = createSectionExtensionRegistry();
 * const value = extensions.parse({ type: 'custom', text: 'Hello' });
 * ```
 *
 * @typeParam K - String discriminator used to identify the plugin in its registry. Must satisfy string.
 * @typeParam D - Validated payload passed from the schema to the renderer or normalizer.
 */
export function createSectionExtensionRegistry<
  K extends string,
  D,
>(plugins: readonly SectionExtensionPlugin<K, D>[] = []): SectionExtensionRegistry {
  const registry = new SectionExtensionRegistry();
  for (const plugin of plugins) registry.register(plugin);
  return registry;
}

/**
 * Preserves a typed extension definition without registering or validating it.
 *
 * @param plugin - Extension type, schema, and optional normalizer.
 * @returns The same extension object with its generic type information preserved.
 * @example
 * ```ts
 * import { defineSectionExtension } from '@alneas/sitekit/sections';
 * import { z } from 'zod';
 * const extension = defineSectionExtension({ type: 'note', schema: z.object({ type: z.literal('note'), text: z.string() }) });
 * ```
 *
 * @typeParam K - String discriminator used to identify the plugin in its registry. Must satisfy string.
 * @typeParam D - Validated payload passed from the schema to the renderer or normalizer.
 */
export function defineSectionExtension<K extends string, D>(
  plugin: SectionExtensionPlugin<K, D>,
): SectionExtensionPlugin<K, D> {
  return plugin;
}
