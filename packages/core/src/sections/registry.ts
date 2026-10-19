import type {
  BaseSectionData,
  SectionComponentProps,
  SectionContext,
  SectionNode,
  SectionPlugin,
} from './types.js';

/**
 * Type-erased registered plugin returned by SectionRegistry.get; its original schema still validates input at runtime.
 */
type RegisteredSectionPlugin = {
  /**
   * Canonical discriminator under which this plugin was registered.
   */
  type: string;
  /**
   * Runtime parser that validates untrusted section data.
   */
  schema: {
  /**
 * Validates raw section data using the registered schema.
 * @param value - Untrusted section payload.
 * @returns The schema-parsed section payload.
 * @throws When schema validation fails.
 * @example
 * ```ts
 * import type { SectionRegistry } from '@alneas/sitekit/sections';
 * export function validate(registry: SectionRegistry, value: unknown) {
 * return registry.get('text')?.schema.parse(value);
 * }
 * ```
 */
parse(value: unknown): unknown };
  /**
   * Renderer invoked with schema-validated and optionally resolved section data.
   * @param props - Section identity, payload and host rendering context.
   * @returns Host-defined rendered output, synchronously or asynchronously.
   * @example
   * ```ts
   * import type { SectionRegistry } from '@alneas/sitekit/sections';
   * type Plugin = NonNullable<ReturnType<SectionRegistry['get']>>;
   * export function invoke(host: Plugin, ...args: Parameters<NonNullable<Plugin['component']>>) {
   * return host.component(...args);
   * }
   * ```
   */
  component: (props: SectionComponentProps<unknown>) => unknown | Promise<unknown>;
  /**
   * Optional data enrichment invoked before the renderer; its result is not revalidated.
   * @param data - Schema-validated section payload.
   * @param context - Host context for this section.
   * @returns Enriched section payload, synchronously or asynchronously.
   * @example
   * ```ts
   * import type { SectionRegistry } from '@alneas/sitekit/sections';
   * type Plugin = NonNullable<ReturnType<SectionRegistry['get']>>;
   * export function invoke(host: Plugin, ...args: Parameters<NonNullable<Plugin['resolveData']>>) {
   * return host.resolveData?.(...args);
   * }
   * ```
   */
  resolveData?: (data: unknown, context: SectionContext) => unknown | Promise<unknown>;
};

/**
 * Mutable registry of section schemas, renderers, and explicit legacy aliases.
 *
 * @example
 * ```ts
 * import { SectionRegistry } from '@alneas/sitekit/sections';
 * const registry = new SectionRegistry();
 * const registeredTypes = registry.types();
 * ```
 */
export class SectionRegistry {
  private readonly plugins = new Map<string, RegisteredSectionPlugin>();
  private readonly aliasMap = new Map<string, string>();

  /**
   * Creates an empty registry with no canonical types or aliases.
   * @example
   * ```ts
   * import { SectionRegistry } from '@alneas/sitekit/sections';
   * const registry = new SectionRegistry();
   * console.log(registry.types());
   * ```
   */
  constructor() {}

  /**
   * Registers a canonical section plugin.
   *
   * @param plugin - Schema, renderer, and optional resolver keyed by type.
   * @returns This registry for chaining.
   * @throws If the type already names a plugin or alias.
   *
   * @example
   * ```ts
   * import type { SectionRegistry } from '@alneas/sitekit/sections';
   * export function useRegister(host: SectionRegistry, ...args: Parameters<NonNullable<SectionRegistry['register']>>) {
   * return host.register(...args);
   * }
   * ```
   * @typeParam K - String discriminator used to identify the plugin in its registry. Must satisfy string.
   * @typeParam D - Validated payload passed from the schema to the renderer or normalizer. Must satisfy BaseSectionData.
   */
  register<K extends string, D extends BaseSectionData>(plugin: SectionPlugin<K, D>): this {
    if (this.plugins.has(plugin.type) || this.aliasMap.has(plugin.type)) {
      throw new Error(`Section plugin already registered: ${plugin.type}`);
    }
    this.plugins.set(plugin.type, plugin as unknown as RegisteredSectionPlugin);
    return this;
  }

  /**
   * Keep legacy content readable while a site migrates to a canonical section type.
   * Aliases are explicit and cannot shadow a real plugin type.
   *
   * @param alias - Unregistered legacy type name.
   * @param canonicalType - Already registered plugin type; aliases cannot target aliases.
   * @returns This registry for chaining.
   * @throws If alias is occupied or canonicalType is not registered.
   *
   * @example
   * ```ts
   * import type { SectionRegistry } from '@alneas/sitekit/sections';
   * export function useRegisterAlias(host: SectionRegistry, ...args: Parameters<NonNullable<SectionRegistry['registerAlias']>>) {
   * return host.registerAlias(...args);
   * }
   * ```
   */
  registerAlias(alias: string, canonicalType: string): this {
    if (this.plugins.has(alias) || this.aliasMap.has(alias)) {
      throw new Error(`Section alias already registered: ${alias}`);
    }
    if (!this.plugins.has(canonicalType)) {
      throw new Error(`Cannot alias unknown section type: ${canonicalType}`);
    }
    this.aliasMap.set(alias, canonicalType);
    return this;
  }

  /**
   * Looks up a plugin, resolving one explicit alias.
   *
   * @param type - Canonical plugin name or registered alias.
   * @returns The registered plugin, or undefined.
   *
   * @example
   * ```ts
   * import type { SectionRegistry } from '@alneas/sitekit/sections';
   * export function useGet(host: SectionRegistry, ...args: Parameters<NonNullable<SectionRegistry['get']>>) {
   * return host.get(...args);
   * }
   * ```
   */
  get(type: string): RegisteredSectionPlugin | undefined {
    return this.plugins.get(this.aliasMap.get(type) ?? type);
  }

  /**
   * Checks direct canonical plugin registration.
   *
   * @param type - Type name to inspect.
   * @returns True only for a registered canonical type; aliases return false.
   *
   * @example
   * ```ts
   * import type { SectionRegistry } from '@alneas/sitekit/sections';
   * export function useHas(host: SectionRegistry, ...args: Parameters<NonNullable<SectionRegistry['has']>>) {
   * return host.has(...args);
   * }
   * ```
   */
  has(type: string): boolean {
    return this.plugins.has(type);
  }

  /**
   * Lists canonical plugin names.
   *
   * @returns A new lexically sorted array excluding aliases.
   *
   * @example
   * ```ts
   * import type { SectionRegistry } from '@alneas/sitekit/sections';
   * export function useTypes(host: SectionRegistry, ...args: Parameters<NonNullable<SectionRegistry['types']>>) {
   * return host.types(...args);
   * }
   * ```
   */
  types(): string[] {
    return [...this.plugins.keys()].sort();
  }

  /**
   * Lists registered legacy-to-canonical mappings.
   *
   * @returns A new object containing all aliases.
   *
   * @example
   * ```ts
   * import type { SectionRegistry } from '@alneas/sitekit/sections';
   * export function useAliases(host: SectionRegistry, ...args: Parameters<NonNullable<SectionRegistry['aliases']>>) {
   * return host.aliases(...args);
   * }
   * ```
   */
  aliases(): Record<string, string> {
    return Object.fromEntries(this.aliasMap.entries());
  }

  /**
   * Validates section data, resolves it if configured, then invokes the component.
   *
   * @param node - Section identifier, requested type, and untrusted data.
   * @param context - Host context supplied to the resolver and component.
   * @returns The component output, awaited when asynchronous.
   * @throws If the type is unknown, validation fails, or the resolver or component fails.
   * @remarks Alias lookup selects the canonical plugin while the component receives the original node.type. Resolved data is not validated again.
   *
   * @example
   * ```ts
   * import type { SectionRegistry } from '@alneas/sitekit/sections';
   * export function useResolve(host: SectionRegistry, ...args: Parameters<NonNullable<SectionRegistry['resolve']>>) {
   * return host.resolve(...args);
   * }
   * ```
   */
  async resolve(
    node: {
  /**
             * Stable identifier for this record.
             */
            id: string;
  /**
                         * Discriminator identifying the record or plugin type.
                         */
                        type: string;
  /**
                                       * Payload associated with this record.
                                       */
                                      data: unknown },
    context: SectionContext,
  ): Promise<unknown> {
    const plugin = this.get(node.type);
    if (!plugin) {
      throw new Error(`Unknown section type: ${node.type}`);
    }
    const data = plugin.schema.parse(node.data);
    const resolved = plugin.resolveData ? await plugin.resolveData(data, context) : data;
    return plugin.component({
      section: { id: node.id, type: node.type, data: resolved },
      context,
    });
  }
}

/**
 * Creates a section registry with optional initial plugins.
 *
 * @returns A mutable registry for schema validation, alias lookup, and rendering.
 * @throws If initial plugins contain duplicate type names.
 * @example
 * ```ts
 * import { createSectionRegistry } from '@alneas/sitekit/sections';
 * const registry = createSectionRegistry();
 * const types = registry.types();
 * ```
 */
export function createSectionRegistry(): SectionRegistry;
/**
 * Creates a registry populated with the supplied plugins.
 *
 * @param plugins - Initial canonical plugin definitions.
 * @returns A mutable section registry.
 * @throws If plugin types are duplicated.
 * @example
 * ```ts
 * import { createSectionRegistry } from '@alneas/sitekit/sections';
 * const registry = createSectionRegistry([]);
 * ```
 *
 * @typeParam K - String discriminator used to identify the plugin in its registry. Must satisfy string.
 * @typeParam D - Validated payload passed from the schema to the renderer or normalizer. Must satisfy BaseSectionData.
 */
export function createSectionRegistry<K extends string, D extends BaseSectionData>(
  plugins: readonly SectionPlugin<K, D>[],
): SectionRegistry;
/**
 * @typeParam K - String discriminator used to identify the plugin in its registry. Must satisfy string.
 * @typeParam D - Validated payload passed from the schema to the renderer or normalizer. Must satisfy BaseSectionData.
 */
export function createSectionRegistry<K extends string, D extends BaseSectionData>(
  plugins: readonly SectionPlugin<K, D>[] = [],
): SectionRegistry {
  const registry = new SectionRegistry();
  for (const plugin of plugins) registry.register(plugin);
  return registry;
}
