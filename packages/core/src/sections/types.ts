import type { ZodType } from 'zod';

/** Host context passed to section data resolvers and components. */
export interface SectionContext {
  /**
   * Host site identifier used to scope the operation.
   */
  siteId: string;
  /**
   * Content locale identifier.
   */
  locale: string;
  /**
   * Current host pathname.
   */
  pathname: string;
  /**
   * Collection records made available by the host to section resolvers and renderers.
   */
  collectionItems: Record<string, unknown[]>;
}

/**
 * Validated section data and its host rendering context.
 * @typeParam T - Section payload type passed to the component.
 */
export interface SectionComponentProps<T> {
  /**
   * Section identity, type and validated data supplied to the renderer.
   */
  section: {
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
    data: T;
  };
  /**
   * Host context accompanying section rendering.
   */
  context: SectionContext;
}

/**
 * Renderer accepting validated section props and returning host-defined output.
 * @param props - Host-supplied rendering properties.
 * @returns The host-defined rendering output, synchronously or asynchronously.
 * @example
 * ```ts
 * import type { SectionComponent } from '@alneas/sitekit/sections';
 * export function invoke(callback: SectionComponent<unknown>, ...args: Parameters<SectionComponent<unknown>>) {
 * return callback(...args);
 * }
 * ```
 *
 * @typeParam T - Section payload type passed to the component.
 */
export type SectionComponent<T> = (
  props: SectionComponentProps<T>,
) => unknown | Promise<unknown>;

/** Minimum discriminated section data accepted by the section registry. */
export interface BaseSectionData {
  /**
   * Discriminator identifying the record or plugin type.
   */
  type: string;
  /**
   * Stable identifier for this record.
   */
  id?: string;
  /**
   * Optional host ordering value; registry rendering does not sort by this field.
   */
  order?: number;
}

/**
 * Section type definition combining validation, rendering, and optional data resolution.
 * @typeParam K - String discriminator used to identify the plugin in its registry. Must satisfy string.
 * @typeParam D - Validated payload passed from the schema to the renderer or normalizer. Must satisfy BaseSectionData.
 */
export interface SectionPlugin<K extends string, D extends BaseSectionData> {
  /**
   * Canonical registry key for this section plugin.
   */
  type: K;
  /** Validates raw section data before data resolution and rendering. */
  schema: ZodType<D>;
  /**
   * Renderer invoked after schema validation and optional data resolution.
   */
  component: SectionComponent<D>;
  /**
   * Optional asynchronous data enrichment; its result is not validated again.
   * @param data - Payload associated with this record.
   * @param context - Host context accompanying section rendering.
   * @returns Enriched section data passed directly to the component without another validation pass.
   * @example
   * ```ts
   * import type { SectionPlugin, BaseSectionData } from '@alneas/sitekit/sections';
   * export function useResolveData(host: SectionPlugin<string, BaseSectionData>, ...args: Parameters<NonNullable<SectionPlugin<string, BaseSectionData>['resolveData']>>) {
   * return host.resolveData?.(...args);
   * }
   * ```
   */
  resolveData?: (data: D, context: SectionContext) => D | Promise<D>;
  /**
   * Optional analytics label retained on the plugin definition.
   */
  analyticsName?: string;
}

/** Mapping from extension type identifiers to their payload types. */
export type SectionExtensionMap = Record<string, unknown>;

/**
 * Discriminated extension union derived from an extension-to-payload map.
 * @typeParam M - Map from extension discriminator names to payload types; defaults to SectionExtensionMap. Must satisfy SectionExtensionMap.
 */
export type SectionExtension<M extends SectionExtensionMap = SectionExtensionMap> = {
  [K in keyof M]: {
    /**
     * Discriminator identifying the record or plugin type.
     */
    type: K;
    /**
     * Payload associated with this record.
     */
    data: M[K];
  };
}[keyof M];

/**
 * Canonical section identity and typed data supplied to section resolution.
 * @typeParam D - Validated payload passed from the schema to the renderer or normalizer. Must satisfy BaseSectionData. Defaults to BaseSectionData.
 */
export interface SectionNode<D extends BaseSectionData = BaseSectionData> {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * Discriminator identifying the record or plugin type.
   */
  type: D['type'];
  /**
   * Payload associated with this record.
   */
  data: D;
}

/**
 * Preserves a typed section plugin definition without registering or validating it.
 *
 * @param plugin - Section type, schema, renderer, and optional data resolver.
 * @returns The same plugin object with its generic type information preserved.
 * @example
 * ```ts
 * import { defineSectionPlugin } from '@alneas/sitekit/sections';
 * import { z } from 'zod';
 * const plugin = defineSectionPlugin({ type: 'text', schema: z.object({ type: z.literal('text') }), component: ({ section }) => section.data.type });
 * ```
 *
 * @typeParam K - String discriminator used to identify the plugin in its registry. Must satisfy string.
 * @typeParam D - Validated payload passed from the schema to the renderer or normalizer. Must satisfy BaseSectionData.
 */
export function defineSectionPlugin<K extends string, D extends BaseSectionData>(
  plugin: SectionPlugin<K, D>,
): SectionPlugin<K, D> {
  return plugin;
}
