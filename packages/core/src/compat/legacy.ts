import type { SectionNode } from '../sections/types.js';
import type { SectionRegistry } from '../sections/registry.js';

/** Legacy section entry whose type is nested in its data payload. */
export interface LegacyPageSectionEntry {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * Legacy section payload, retained by reference during conversion.
   */
  data: {
    /**
     * Discriminator identifying the record or plugin type.
     */
    type: string;
    /**
     * Additional domain-specific payload key.
     */
    [key: string]: unknown;
  };
}

/**
 * Converts a legacy nested section entry to a canonical section node.
 *
 * @param entry - Legacy identifier and data containing a section type.
 * @returns A new node that shares the original data object.
 * @example
 * ```ts
 * import { toSectionNode } from '@alneas/sitekit/compat';
 * const node = toSectionNode({ id: 'intro', data: { type: 'hero' } });
 * ```
 */
export function toSectionNode(entry: LegacyPageSectionEntry): SectionNode {
  return {
    id: entry.id,
    type: entry.data.type,
    data: entry.data,
  };
}

/**
 * Registers legacy section names against existing canonical plugins.
 *
 * @param registry - Registry mutated by the registrations.
 * @param aliases - Mapping from legacy names to registered canonical types.
 * @returns The same registry for chaining.
 * @throws If an alias collides or a canonical type is not registered.
 * @remarks Earlier aliases remain registered if a later entry fails.
 * @example
 * ```ts
 * import { registerLegacyAliases } from '@alneas/sitekit/compat';
 * import { createSectionRegistry } from '@alneas/sitekit/sections';
 * const registry = registerLegacyAliases(createSectionRegistry(), {});
 * ```
 */
export function registerLegacyAliases(
  registry: SectionRegistry,
  aliases: Record<string, string>,
): SectionRegistry {
  for (const [legacyType, canonicalType] of Object.entries(aliases)) {
    registry.registerAlias(legacyType, canonicalType);
  }
  return registry;
}
