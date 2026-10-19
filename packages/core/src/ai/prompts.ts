/**
 * Versioned system prompt and input-to-user-message formatter.
 * @typeParam Input - Input shape consumed by the prompt formatter; defaults to unknown.
 */
export interface AiPromptDefinition<Input = unknown> {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * Version identifier for this definition.
   */
  version: string;
  /**
   * System message text for this prompt.
   */
  system: string;
  /**
   * Formats the prompt-specific input into a user message.
   *
   * @param input - Input expected by this prompt definition.
   * @returns The user message text.
   *
   * @example
   * ```ts
   * import type { AiPromptDefinition } from '@alneas/sitekit/ai';
   * export function useBuildUser(host: AiPromptDefinition<unknown>, ...args: Parameters<NonNullable<AiPromptDefinition<unknown>['buildUser']>>) {
   * return host.buildUser(...args);
   * }
   * ```
   */
  buildUser(input: Input): string;
  /**
   * Host or provider metadata carried alongside the normalized record.
   */
  metadata?: Readonly<Record<string, string>>;
}

/** Mutable prompt registry; unversioned lookup uses descending lexical version order. */
export interface AiPromptRegistry {
  /**
   * Registers a unique prompt identifier and version.
   *
   * @param definition - Prompt to add.
   * @returns This registry for chaining.
   * @throws If the identifier and version are already registered.
   *
   * @example
   * ```ts
   * import type { AiPromptRegistry } from '@alneas/sitekit/ai';
   * export function useRegister(host: AiPromptRegistry, ...args: Parameters<NonNullable<AiPromptRegistry['register']>>) {
   * return host.register(...args);
   * }
   * ```
   */
  register(definition: AiPromptDefinition): AiPromptRegistry;
  /**
   * Finds a prompt by exact version or descending lexical version order.
   *
   * @param id - Prompt identifier.
   * @param version - Exact version; omitted to select by lexical ordering.
   * @returns The matching definition, or undefined.
   *
   * @example
   * ```ts
   * import type { AiPromptRegistry } from '@alneas/sitekit/ai';
   * export function useGet(host: AiPromptRegistry, ...args: Parameters<NonNullable<AiPromptRegistry['get']>>) {
   * return host.get(...args);
   * }
   * ```
   */
  get(id: string, version?: string): AiPromptDefinition | undefined;
  /**
   * Lists all registered prompt versions.
   *
   * @returns A new array in registration order.
   *
   * @example
   * ```ts
   * import type { AiPromptRegistry } from '@alneas/sitekit/ai';
   * export function useList(host: AiPromptRegistry, ...args: Parameters<NonNullable<AiPromptRegistry['list']>>) {
   * return host.list(...args);
   * }
   * ```
   */
  list(): readonly AiPromptDefinition[];
}

/**
 * Creates an in-memory registry keyed by prompt identifier and version.
 *
 * @param definitions - Initial prompt definitions; defaults to an empty registry.
 * @returns A mutable registry with chainable registration, lookup, and insertion-order listing.
 * @throws If initial definitions contain the same identifier and version.
 * @remarks Lookup without a version selects the greatest version by localeCompare, not semantic version precedence.
 * @example
 * ```ts
 * import { createAiPromptRegistry } from '@alneas/sitekit/ai';
 * const prompts = createAiPromptRegistry([{ id: 'summary', version: '1', system: 'Summarize.', buildUser: input => String(input) }]);
 * const prompt = prompts.get('summary');
 * ```
 */
export function createAiPromptRegistry(
  definitions: readonly AiPromptDefinition[] = [],
): AiPromptRegistry {
  const entries = new Map<string, AiPromptDefinition>();
  const keyFor = (definition: Pick<AiPromptDefinition, 'id' | 'version'>) =>
    `${definition.id}@${definition.version}`;

  const registry: AiPromptRegistry = {
    register(definition) {
      const key = keyFor(definition);
      if (entries.has(key)) throw new Error(`AI prompt already registered: ${key}`);
      entries.set(key, definition);
      return registry;
    },
    get(id, version) {
      if (version !== undefined) return entries.get(`${id}@${version}`);
      const matches = [...entries.values()].filter(definition => definition.id === id);
      return matches.sort((left, right) => right.version.localeCompare(left.version))[0];
    },
    list() {
      return [...entries.values()];
    },
  };

  for (const definition of definitions) registry.register(definition);
  return registry;
}
