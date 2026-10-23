import { z } from 'zod';
import { parseMarketingScope } from './schemas.js';
import type { MarketingProviderFactories, MarketingServices } from './contracts.js';

export * from './schemas.js';
export * from './contracts.js';
export { parseMarketingSpendCsv } from './csv.js';

/**
 * Selects one explicit server-owned provider independently of the content source.
 * @param config - Strict backend selector and host-authorized site scope.
 * @param factories - Server factories for configured backends.
 * @returns A provider with the exact requested scope; missing providers throw.
 * @example
 * import { resolveMarketingServices, type MarketingProviderFactories } from '@alneas/sitekit/marketing';
 * export function resolve(factories: MarketingProviderFactories) { return resolveMarketingServices({ backend: 'standalone', scope: { siteId: 'example' } }, factories); }
 */
export function resolveMarketingServices(config: unknown, factories: MarketingProviderFactories): MarketingServices {
  const value = z.strictObject({ backend: z.enum(['standalone', 'eaos']), scope: z.unknown() }).parse(config);
  const scope = parseMarketingScope(value.scope);
  const factory = factories[value.backend];
  if (!factory) throw new Error('Marketing backend is not configured');
  const services = factory(Object.freeze(scope));
  const actual = parseMarketingScope(services.scope);
  if (actual.siteId !== scope.siteId || actual.tenantId !== scope.tenantId) throw new Error('Marketing provider scope mismatch');
  return services;
}
